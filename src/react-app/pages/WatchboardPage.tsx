/**
 * WatchboardPage - Multi-board game watching command center
 * Responsive grid layout: 1 game=large, 2-4=2x2, 5-6=3x2, 7+=scroll
 */

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useNavigate, Link, useParams, useSearchParams } from "react-router-dom";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Eye,
  Radio,
  Clock,
  RefreshCw,
  Lock,
  Crown,
  ChevronRight,
  ArrowLeft,
  CheckCircle,
  Volume2,
  VolumeX,
  Send,
  Loader2,
} from "lucide-react";
import { ShareButton, type ShareData } from "@/react-app/components/ShareModal";
import { Input } from "@/react-app/components/ui/input";
import { useSubscription, type GZSportsTier } from "@/react-app/hooks/useSubscription";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Button } from "@/react-app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { cn } from "@/react-app/lib/utils";
import { useWatchboards, type Watchboard, type WatchboardProp, type WatchboardPlayer } from "@/react-app/hooks/useWatchboards";
import { GripVertical, Zap, Target, CheckCircle2, MessageCircle, Ticket, User } from "lucide-react";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { PlayerPhoto } from "@/react-app/components/PlayerPhoto";
import { CoachGExternalLinkIcon } from "@/react-app/components/CoachGExternalLinkIcon";
import { CoachGAvatar } from "@/react-app/components/CoachGAvatar";
import { getTeamColors } from "@/react-app/data/team-colors";
import { useSoundEffects, type SoundType } from "@/react-app/hooks/useSoundEffects";
import { useDataHubWatchboards } from "@/react-app/hooks/useDataHub";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { canonicalPlayerIdQueryParam, logPlayerNavigation } from "@/react-app/lib/navigationRoutes";
import { navigateToPlayerProfile } from "@/react-app/lib/playerProfileNavigation";
import { prefetchFullPlayerProfileSnapshot } from "@/react-app/lib/playerProfileSnapshotPrewarm";

// =====================================================
// BOARD COLOR PALETTE
// =====================================================

const BOARD_COLORS = [
  { border: 'border-blue-500/50', bg: 'bg-blue-500/5', accent: '#3b82f6', text: 'text-blue-400' },
  { border: 'border-purple-500/50', bg: 'bg-purple-500/5', accent: '#a855f7', text: 'text-purple-400' },
  { border: 'border-emerald-500/50', bg: 'bg-emerald-500/5', accent: '#10b981', text: 'text-emerald-400' },
  { border: 'border-amber-500/50', bg: 'bg-amber-500/5', accent: '#f59e0b', text: 'text-amber-400' },
  { border: 'border-rose-500/50', bg: 'bg-rose-500/5', accent: '#f43f5e', text: 'text-rose-400' },
  { border: 'border-cyan-500/50', bg: 'bg-cyan-500/5', accent: '#06b6d4', text: 'text-cyan-400' },
  { border: 'border-orange-500/50', bg: 'bg-orange-500/5', accent: '#f97316', text: 'text-orange-400' },
  { border: 'border-pink-500/50', bg: 'bg-pink-500/5', accent: '#ec4899', text: 'text-pink-400' },
];
const DEFAULT_BOARD_COLOR = BOARD_COLORS[0];

// =====================================================
// TYPES
// =====================================================

interface GameData {
  game_id: string;
  sport: string;
  home_team_code: string;
  away_team_code: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  period_label: string | null;
  clock: string | null;
  start_time: string;
}

const INVALID_WATCHBOARD_TEAM_TOKENS = new Set(["", "TBD", "UNK", "UNKNOWN", "HOME", "AWAY"]);

function looksLikeRawWatchboardId(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized.startsWith("sr:")
    || normalized.startsWith("sr_")
    || normalized.startsWith("espn_")
    || normalized.includes(":sport_event:")
    || normalized.includes(":match:");
}

function isRenderableWatchboardGame(game: GameData | undefined | null): game is GameData {
  if (!game) return false;
  const sport = String(game.sport || "").trim().toLowerCase();
  if (!sport || sport === "unknown") return false;
  if (String(game.status || "").trim().toUpperCase() === "UNKNOWN") return false;
  const homeCode = String(game.home_team_code || "").trim().toUpperCase();
  const awayCode = String(game.away_team_code || "").trim().toUpperCase();
  if (INVALID_WATCHBOARD_TEAM_TOKENS.has(homeCode) || INVALID_WATCHBOARD_TEAM_TOKENS.has(awayCode)) return false;
  const gameId = String(game.game_id || "").trim();
  const homeName = String(game.home_team_name || "").trim();
  const awayName = String(game.away_team_name || "").trim();
  if (homeName && (looksLikeRawWatchboardId(homeName) || homeName === gameId)) return false;
  if (awayName && (looksLikeRawWatchboardId(awayName) || awayName === gameId)) return false;
  return true;
}

interface LatestPlay {
  description: string;
  team: string | null;
  isMajor: boolean;
  isScoring: boolean;
  points: number;
  playerName: string | null;
}

// Bet leg status for game tiles
interface BetLeg {
  leg_id: number;
  team_or_player: string;
  market_type: string;
  side: string | null;
  user_line_value: number | null;
  user_odds: number | null;
  leg_status: string; // Pending, Covering, NotCovering, Won, Lost, Push
  ticket_id: number;
  ticket_title: string | null;
  ticket_type: string;
}

// =====================================================
// TIER LIMITS CONFIGURATION
// =====================================================

interface TierLimits {
  maxBoards: number;
  maxGames: number;
  hasProps: boolean;
}

// Generous board/game caps keep watchboard workflows frictionless.
const TIER_LIMITS: Record<GZSportsTier, TierLimits> = {
  anonymous: { maxBoards: 99, maxGames: 99, hasProps: true },
  free: { maxBoards: 99, maxGames: 99, hasProps: true },
  pool_access: { maxBoards: 99, maxGames: 99, hasProps: true },
  scout_pro: { maxBoards: 99, maxGames: 99, hasProps: true },
  scout_elite: { maxBoards: 99, maxGames: 99, hasProps: true },
  admin_starter: { maxBoards: 99, maxGames: 99, hasProps: true },
  admin_unlimited: { maxBoards: 99, maxGames: 99, hasProps: true },
};

function getTierLimits(tier: GZSportsTier | undefined): TierLimits {
  return TIER_LIMITS[tier || "free"];
}

// =====================================================
// UPGRADE PROMPT COMPONENTS
// =====================================================

export function PropsUpgradePrompt() {
  return (
    <div className="mt-8 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-blue-500/5 p-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30">
          <Target className="h-6 w-6 text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-white">Player Props Tracking</h3>
            <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
              Pro
            </span>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            Track player props in real-time with live stat updates. See how your picks are performing as the game unfolds.
          </p>
          <Link to="/settings?tab=subscription">
            <Button size="sm" className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white">
              <Crown className="h-4 w-4 mr-2" />
              Upgrade to Pro
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function BoardLimitPrompt({ maxBoards, tier }: { maxBoards: number; tier: string }) {
  const isPro = tier === "scout_pro";
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-4">
      <div className="flex items-center gap-3">
        <Lock className="h-5 w-5 text-amber-400" />
        <div className="flex-1">
          <p className="text-sm text-white">
            You've reached your {maxBoards} board limit.{" "}
            <Link to="/settings?tab=subscription" className="text-amber-400 hover:text-amber-300 font-medium">
              {isPro ? "Upgrade to Elite" : "Upgrade to Pro"} →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function GameLimitPrompt({ currentGames, maxGames, tier }: { currentGames: number; maxGames: number; tier: string }) {
  const isPro = tier === "scout_pro";
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 mt-2">
      <div className="flex items-center gap-2 text-sm">
        <Lock className="h-4 w-4 text-amber-400" />
        <span className="text-white/70">
          {currentGames}/{maxGames} games.{" "}
          <Link to="/settings?tab=subscription" className="text-amber-400 hover:text-amber-300 font-medium">
            {isPro ? "Upgrade to Elite" : "Upgrade"} for more →
          </Link>
        </span>
      </div>
    </div>
  );
}

// =====================================================
// CINEMATIC BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      <div
        className="absolute top-1/4 -left-32 h-96 w-96 rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-1/3 -right-32 h-96 w-96 rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

// =====================================================
// COVERAGE BADGE COMPONENT
// =====================================================

interface CoverageBadgeProps {
  legs: BetLeg[];
}

// Format user's line for display (e.g., "+3.5", "O 220.5", "ML")
function formatUserLine(leg: BetLeg): string {
  const market = leg.market_type?.toLowerCase() || '';
  const line = leg.user_line_value;
  const side = leg.side?.toLowerCase() || '';
  
  if (market === 'moneyline' || market === 'ml') {
    return 'ML';
  }
  if (market === 'total' || market === 'over' || market === 'under' || side === 'over' || side === 'under') {
    const prefix = side === 'over' || market === 'over' ? 'O' : side === 'under' || market === 'under' ? 'U' : '';
    return line !== null ? `${prefix} ${line}` : prefix || 'Total';
  }
  if (market === 'spread' || line !== null) {
    return line !== null ? (line > 0 ? `+${line}` : `${line}`) : '';
  }
  return market.toUpperCase().slice(0, 3);
}

// Format American odds (e.g., "-110", "+150")
function formatOdds(odds: number | null): string {
  if (odds === null) return '';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function CoverageBadge({ legs }: CoverageBadgeProps) {
  if (legs.length === 0) return null;

  // Determine overall status: if any leg is covering, show covering; if all not covering, show short
  const coveringLegs = legs.filter(l => l.leg_status === "Covering" || l.leg_status === "Won");
  const notCoveringLegs = legs.filter(l => l.leg_status === "NotCovering" || l.leg_status === "Lost");
  const pendingLegs = legs.filter(l => l.leg_status === "Pending");
  
  let status: "covering" | "short" | "pending" | "mixed" = "pending";
  let bgColor = "bg-slate-500/20";
  let textColor = "text-slate-400";
  let borderColor = "border-slate-500/30";
  let statusLabel = "Bet";

  if (coveringLegs.length > 0 && notCoveringLegs.length === 0) {
    status = "covering";
    bgColor = "bg-emerald-500/20";
    textColor = "text-emerald-400";
    borderColor = "border-emerald-500/40";
    statusLabel = "✓";
  } else if (notCoveringLegs.length > 0 && coveringLegs.length === 0) {
    status = "short";
    bgColor = "bg-red-500/20";
    textColor = "text-red-400";
    borderColor = "border-red-500/40";
    statusLabel = "✗";
  } else if (coveringLegs.length > 0 && notCoveringLegs.length > 0) {
    status = "mixed";
    bgColor = "bg-amber-500/20";
    textColor = "text-amber-400";
    borderColor = "border-amber-500/40";
    statusLabel = "~";
  } else if (pendingLegs.length === legs.length) {
    status = "pending";
    bgColor = "bg-blue-500/20";
    textColor = "text-blue-400";
    borderColor = "border-blue-500/30";
    statusLabel = "•";
  }

  // For single leg, show full details. For multiple, show summary
  const showFullDetails = legs.length === 1;
  const leg = legs[0];

  // Glow effects for different statuses
  const glowStyle = status === "covering" 
    ? "shadow-[0_0_12px_rgba(16,185,129,0.5)]" 
    : status === "short" 
    ? "shadow-[0_0_8px_rgba(239,68,68,0.3)]"
    : "";

  return (
    <div className="absolute bottom-1.5 sm:bottom-3 right-1.5 sm:right-3 z-10">
      <div
        className={cn(
          "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-medium border backdrop-blur-sm transition-all duration-300",
          bgColor, textColor, borderColor, glowStyle
        )}
        title={legs.map(l => `${l.team_or_player}: ${formatUserLine(l)} ${formatOdds(l.user_odds)} (${l.leg_status})`).join("\n")}
      >
        {showFullDetails ? (
          <>
            {/* Line value - large and prominent */}
            <span className="text-sm sm:text-base font-bold tracking-tight">{formatUserLine(leg)}</span>
            {/* Odds - smaller secondary info */}
            {leg.user_odds && (
              <span className="text-[10px] sm:text-xs opacity-60 font-normal">{formatOdds(leg.user_odds)}</span>
            )}
            {/* Status indicator */}
            <span className={cn(
              "text-sm sm:text-base font-bold",
              status === "covering" && "text-emerald-300",
              status === "short" && "text-red-300"
            )}>{statusLabel}</span>
          </>
        ) : (
          <>
            {/* Show summary for multiple legs */}
            <Ticket className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="text-xs sm:text-sm font-semibold">{legs.length} Bets</span>
            {status !== "pending" && (
              <span className="text-[10px] sm:text-xs opacity-70">({coveringLegs.length}/{legs.length})</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =====================================================
// GAME TILE COMPONENT
// =====================================================

interface GameTileProps {
  game: GameData;
  isLarge?: boolean;
  isPinned?: boolean;
  onRemove: () => void;
  onPin?: () => void;
  onClick: () => void;
  // Live ticker
  latestPlay?: LatestPlay | null;
  // Bet coverage
  betLegs?: BetLeg[];
  // Sound callback for status changes
  onStatusSound?: (sound: SoundType) => void;
  // Drag & drop
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const GameTile = memo(function GameTile({ 
  game, isLarge, isPinned, onRemove, onPin, onClick,
  latestPlay,
  betLegs,
  onStatusSound,
  isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop 
}: GameTileProps) {
  const homeColors = getTeamColors(game.home_team_code);
  const awayColors = getTeamColors(game.away_team_code);
  const isLive = game.status === "IN_PROGRESS" || game.status === "live";
  const isFinal = game.status === "FINAL" || game.status === "final";
  const awayWon = isFinal
    && game.away_score !== null
    && game.home_score !== null
    && game.away_score > game.home_score;
  const homeWon = isFinal
    && game.away_score !== null
    && game.home_score !== null
    && game.home_score > game.away_score;
  
  // Status change shimmer animation
  const [showShimmer, setShowShimmer] = useState<'green' | 'red' | 'amber' | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  // Determine bet leg glow status
  const getBetGlowStatus = () => {
    if (!betLegs || betLegs.length === 0) return null;
    
    const coveringLegs = betLegs.filter(l => l.leg_status === "Covering");
    const wonLegs = betLegs.filter(l => l.leg_status === "Won");
    const notCoveringLegs = betLegs.filter(l => l.leg_status === "NotCovering");
    const lostLegs = betLegs.filter(l => l.leg_status === "Lost");
    const pendingLegs = betLegs.filter(l => l.leg_status === "Pending");
    
    // Won takes priority - solid green
    if (wonLegs.length > 0 && notCoveringLegs.length === 0 && lostLegs.length === 0) return "won";
    // Lost - dimmed
    if (lostLegs.length > 0 && coveringLegs.length === 0 && wonLegs.length === 0) return "lost";
    // Covering - pulsing green
    if (coveringLegs.length > 0 && notCoveringLegs.length === 0 && lostLegs.length === 0) return "covering";
    // Not covering - red glow
    if (notCoveringLegs.length > 0 && coveringLegs.length === 0 && wonLegs.length === 0) return "not-covering";
    // Mixed - amber
    if ((coveringLegs.length > 0 || wonLegs.length > 0) && (notCoveringLegs.length > 0 || lostLegs.length > 0)) return "mixed";
    // Pending - neutral
    if (pendingLegs.length === betLegs.length) return "pending";
    
    return null;
  };
  
  const betGlowStatus = getBetGlowStatus();
  
  // Detect status changes and trigger shimmer + sound
  useEffect(() => {
    if (prevStatusRef.current !== null && prevStatusRef.current !== betGlowStatus && betGlowStatus) {
      // Status changed - determine shimmer color and sound based on new status
      if (betGlowStatus === 'covering') {
        setShowShimmer('green');
        onStatusSound?.('betCovering');
      } else if (betGlowStatus === 'won') {
        setShowShimmer('green');
        onStatusSound?.('betWon');
      } else if (betGlowStatus === 'not-covering') {
        setShowShimmer('red');
        onStatusSound?.('betNotCovering');
      } else if (betGlowStatus === 'lost') {
        setShowShimmer('red');
        onStatusSound?.('betLost');
      } else if (betGlowStatus === 'mixed') {
        setShowShimmer('amber');
      }
      
      // Clear shimmer after animation
      const timer = setTimeout(() => setShowShimmer(null), 1500);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = betGlowStatus;
  }, [betGlowStatus, onStatusSound]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative group rounded-xl border bg-slate-900/80 backdrop-blur-sm",
        "hover:bg-slate-800/90 transition-all duration-300 cursor-pointer",
        "overflow-hidden",
        // Mobile-first compact sizing, expand on larger screens
        isLarge ? "min-h-[200px] sm:min-h-[280px]" : "min-h-[120px] sm:min-h-[180px]",
        // Default border
        !betGlowStatus && "border-white/10 hover:border-blue-500/30",
        // Bet status glow effects
        betGlowStatus === "covering" && "border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3),0_0_40px_rgba(16,185,129,0.15)] animate-bet-glow-green",
        betGlowStatus === "won" && "border-emerald-400/60 shadow-[0_0_15px_rgba(52,211,153,0.4),0_0_30px_rgba(52,211,153,0.2)]",
        betGlowStatus === "not-covering" && "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3),0_0_40px_rgba(239,68,68,0.15)]",
        betGlowStatus === "lost" && "border-slate-600/50 opacity-60 saturate-50",
        betGlowStatus === "mixed" && "border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]",
        betGlowStatus === "pending" && "border-blue-500/20",
        // Other states
        isPinned && !betGlowStatus && "ring-2 ring-amber-500/50",
        isDragging && "opacity-50 scale-95 ring-2 ring-blue-500/50",
        isDragOver && "ring-2 ring-green-500/50 bg-green-500/5"
      )}
      onClick={onClick}
    >
      {/* Gradient accent */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${homeColors?.primary || "#3b82f6"}, ${awayColors?.primary || "#8b5cf6"})`,
        }}
      />
      
      {/* Status change shimmer overlay */}
      {showShimmer && (
        <div 
          className={cn(
            "absolute inset-0 pointer-events-none z-20 rounded-xl overflow-hidden",
            "animate-status-shimmer"
          )}
          style={{
            background: showShimmer === 'green' 
              ? 'linear-gradient(90deg, transparent 0%, rgba(16, 185, 129, 0.4) 50%, transparent 100%)'
              : showShimmer === 'red'
              ? 'linear-gradient(90deg, transparent 0%, rgba(239, 68, 68, 0.4) 50%, transparent 100%)'
              : 'linear-gradient(90deg, transparent 0%, rgba(245, 158, 11, 0.4) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      )}

      {/* Status badge */}
      <div className="absolute top-1.5 sm:top-3 left-1.5 sm:left-3 z-10">
        {isLive ? (
          <span className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-red-500/20 text-red-400 text-[10px] sm:text-xs font-medium">
            <Radio className="w-2 h-2 sm:w-3 sm:h-3 animate-pulse" />
            LIVE
          </span>
        ) : isFinal ? (
          <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-slate-700/50 text-slate-400 text-[10px] sm:text-xs font-medium">
            {formatFinalStatusWithDate(game.start_time)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-slate-700/50 text-slate-400 text-[10px] sm:text-xs">
            <Clock className="w-2 h-2 sm:w-3 sm:h-3 hidden sm:block" />
            {formatGameTime(game.start_time)}
          </span>
        )}
      </div>

      {/* Actions menu */}
      <div className="absolute top-1.5 sm:top-3 right-1.5 sm:right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-slate-800/80">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {onPin && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin(); }}>
                {isPinned ? <PinOff className="w-4 h-4 mr-2" /> : <Pin className="w-4 h-4 mr-2" />}
                {isPinned ? "Unpin" : "Pin to top"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-red-400 focus:text-red-400"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pinned indicator */}
      {isPinned && (
        <div className="absolute top-3 right-12 z-10">
          <Pin className="w-4 h-4 text-amber-500" />
        </div>
      )}

      {/* Drag handle */}
      <div 
        className="absolute top-1/2 left-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-5 h-5 text-slate-500" />
      </div>

      {/* Main content */}
      <div className={cn("flex flex-col justify-center h-full p-2 sm:p-4", isLarge ? "pt-10 sm:pt-12" : "pt-8 sm:pt-10")}>
        {/* Away team */}
        <div className="flex items-center justify-between mb-1.5 sm:mb-3">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <TeamLogo
              teamCode={game.away_team_code || 'TBD'}
              sport={game.sport.toUpperCase()}
              size={isLarge ? 32 : 24}
              winnerGlow={awayWon}
              className={cn("rounded-full bg-slate-800", isLarge ? "sm:!w-12 sm:!h-12" : "sm:!w-9 sm:!h-9")}
            />
            <div>
              <div className={cn("font-bold text-white", isLarge ? "text-sm sm:text-lg" : "text-xs sm:text-base")}>
                {game.away_team_code}
              </div>
              {isLarge && (
                <div className="text-xs sm:text-sm text-slate-400 hidden sm:block">{game.away_team_name}</div>
              )}
            </div>
          </div>
          <div className={cn("font-mono font-bold", isLarge ? "text-xl sm:text-3xl" : "text-lg sm:text-2xl", game.away_score !== null ? "text-white" : "text-slate-500")}>
            {game.away_score ?? "-"}
          </div>
        </div>

        {/* Home team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <TeamLogo
              teamCode={game.home_team_code || 'TBD'}
              sport={game.sport.toUpperCase()}
              size={isLarge ? 32 : 24}
              winnerGlow={homeWon}
              className={cn("rounded-full bg-slate-800", isLarge ? "sm:!w-12 sm:!h-12" : "sm:!w-9 sm:!h-9")}
            />
            <div>
              <div className={cn("font-bold text-white", isLarge ? "text-sm sm:text-lg" : "text-xs sm:text-base")}>
                {game.home_team_code}
              </div>
              {isLarge && (
                <div className="text-xs sm:text-sm text-slate-400 hidden sm:block">{game.home_team_name}</div>
              )}
            </div>
          </div>
          <div className={cn("font-mono font-bold", isLarge ? "text-xl sm:text-3xl" : "text-lg sm:text-2xl", game.home_score !== null ? "text-white" : "text-slate-500")}>
            {game.home_score ?? "-"}
          </div>
        </div>

        {/* Period/Clock */}
        {isLive && (game.period_label || game.clock) && (
          <div className="mt-1.5 sm:mt-3 pt-1.5 sm:pt-3 border-t border-white/5 text-center">
            <span className="text-[10px] sm:text-sm text-slate-400">
              {game.period_label} {game.clock && `• ${game.clock}`}
            </span>
          </div>
        )}

        {/* Mini Event Ticker - hide on mobile for compact view */}
        {isLive && latestPlay && (
          <div 
            className={cn(
              "hidden sm:block mt-3 pt-3 border-t border-white/5",
              latestPlay.isMajor && "animate-pulse"
            )}
          >
            <div className={cn(
              "flex items-center gap-2 text-xs",
              latestPlay.isMajor ? "text-amber-400" : "text-slate-400"
            )}>
              {latestPlay.isMajor && (
                <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
              )}
              <span className="truncate">
                {latestPlay.playerName ? `${latestPlay.playerName}: ` : ""}
                {latestPlay.description.length > 50 
                  ? latestPlay.description.slice(0, 50) + "…" 
                  : latestPlay.description}
              </span>
              {latestPlay.isScoring && latestPlay.points > 0 && (
                <span className="ml-auto flex-shrink-0 bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                  +{latestPlay.points}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sport badge */}
      <div className="absolute bottom-1.5 sm:bottom-3 left-1.5 sm:left-3">
        <span className="text-[8px] sm:text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          {game.sport}
        </span>
      </div>

      {/* Bet coverage badge */}
      {betLegs && betLegs.length > 0 && (
        <CoverageBadge legs={betLegs} />
      )}
    </div>
  );
});

function formatGameTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const formattedTime = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    return isToday ? formattedTime : `${formattedDate} • ${formattedTime}`;
  } catch {
    return "";
  }
}

function formatFinalStatusWithDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "FINAL";
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `FINAL • ${formattedDate}`;
  } catch {
    return "FINAL";
  }
}

// =====================================================
// BOARD COMPONENTS (BoardSelector removed - all boards shown at once)
// =====================================================

// BoardSelector removed - now showing all boards at once with inline rename/delete dropdowns

// =====================================================
// EMPTY STATE
// =====================================================

function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-6">
        <Eye className="w-10 h-10 text-blue-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">No games on this board</h2>
      <p className="text-slate-400 mb-6 max-w-md">
        Add games to your watchboard to track them here. Click "+ Watch" on any game card to get started.
      </p>
      <Button onClick={() => navigate("/games")} className="gap-2">
        <Plus className="w-4 h-4" />
        Browse Games
      </Button>
    </div>
  );
}

// =====================================================
// PROP TILE COMPONENT - Enhanced with Live Stat Progress
// =====================================================

interface PropTileProps {
  prop: WatchboardProp;
  onRemove: () => void;
  liveStatValue?: number | null;
  gameData?: GameData | null;
  justUpdated?: boolean;
  justHitTarget?: boolean;
  justFellBehind?: boolean;
}

// Circular progress ring component
function ProgressRing({ 
  current, 
  target, 
  size = 64, 
  strokeWidth = 4,
  isHitting,
  isPacing 
}: { 
  current: number; 
  target: number; 
  size?: number; 
  strokeWidth?: number;
  isHitting: boolean;
  isPacing: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(current / target, 1);
  const strokeDashoffset = circumference - progress * circumference;
  
  // Color based on status
  const progressColor = isHitting 
    ? "#10b981" // emerald-500
    : isPacing 
    ? "#f59e0b" // amber-500
    : "#64748b"; // slate-500
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
          style={{
            filter: isHitting ? `drop-shadow(0 0 6px ${progressColor})` : 'none'
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn(
          "text-lg font-bold leading-none",
          isHitting ? "text-emerald-400" : isPacing ? "text-amber-400" : "text-white"
        )}>
          {current}
        </span>
        <span className="text-[10px] text-slate-500 leading-none mt-0.5">/{target}</span>
      </div>
    </div>
  );
}

function PropTile({ prop, onRemove, liveStatValue, gameData, justUpdated, justHitTarget, justFellBehind }: PropTileProps) {
  const teamColors = getTeamColors(prop.team || "");
  // Use live stat if available, otherwise fall back to stored value
  const currentValue = liveStatValue ?? prop.current_stat_value ?? 0;
  const lineValue = prop.line_value;
  
  // Determine status - for "over" bets, need to exceed line
  const isOver = prop.selection?.toLowerCase() === 'over';
  const isHitting = isOver 
    ? currentValue >= lineValue 
    : currentValue <= lineValue;
  const isPacing = isOver
    ? currentValue >= lineValue * 0.6
    : currentValue <= lineValue * 1.4;
  
  // Progress percentage
  const progressPercent = Math.min((currentValue / lineValue) * 100, 100);
  
  // Game status
  const isLive = gameData?.status === "IN_PROGRESS" || gameData?.status === "live";
  const isFinal = gameData?.status === "FINAL" || gameData?.status === "final";
  const hasLiveData = liveStatValue !== null && liveStatValue !== undefined;
  
  // Format prop type display
  const formatPropType = (type: string) => {
    const typeMap: Record<string, string> = {
      'points': 'PTS',
      'rebounds': 'REB',
      'assists': 'AST',
      'threes': '3PT',
      'steals': 'STL',
      'blocks': 'BLK',
      'pts_reb_ast': 'PRA',
      'pts_reb': 'P+R',
      'pts_ast': 'P+A',
      'reb_ast': 'R+A',
      'passing_yards': 'PASS YDS',
      'rushing_yards': 'RUSH YDS',
      'receiving_yards': 'REC YDS',
      'touchdowns': 'TDs',
      'strikeouts': 'Ks',
      'hits': 'HITS',
      'home_runs': 'HRs',
    };
    return typeMap[type.toLowerCase()] || type.toUpperCase();
  };

  // Format prop type for display in progress context (e.g., "assists", "points")
  const formatPropTypeLong = (type: string) => {
    const typeMap: Record<string, string> = {
      'points': 'points',
      'rebounds': 'rebounds',
      'assists': 'assists',
      'threes': 'threes',
      'steals': 'steals',
      'blocks': 'blocks',
      'pts_reb_ast': 'PRA',
      'pts_reb': 'pts+reb',
      'pts_ast': 'pts+ast',
      'reb_ast': 'reb+ast',
      'passing_yards': 'pass yds',
      'rushing_yards': 'rush yds',
      'receiving_yards': 'rec yds',
      'touchdowns': 'TDs',
      'strikeouts': 'Ks',
      'hits': 'hits',
      'home_runs': 'HRs',
    };
    return typeMap[type.toLowerCase()] || type;
  };

  return (
    <div className={cn(
      "relative group rounded-xl border bg-slate-900/80 backdrop-blur-sm p-4 transition-all duration-300",
      isHitting && hasLiveData && "border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]",
      !isHitting && isPacing && hasLiveData && "border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]",
      !isHitting && !isPacing && hasLiveData && "border-red-500/30",
      !hasLiveData && "border-white/10 hover:border-blue-500/30",
      // Pulse animation when stat just updated
      justUpdated && "animate-pulse-glow",
      justHitTarget && "animate-hit-target",
      justFellBehind && "animate-falling-behind"
    )}
    style={{
      // Enhanced glow when just updated
      boxShadow: justHitTarget
        ? "0 0 30px rgba(16,185,129,0.6), 0 0 60px rgba(16,185,129,0.3), inset 0 0 20px rgba(16,185,129,0.1)"
        : justFellBehind
        ? "0 0 30px rgba(239,68,68,0.5), 0 0 60px rgba(239,68,68,0.25)"
        : justUpdated
        ? isHitting
          ? "0 0 25px rgba(16,185,129,0.5), 0 0 50px rgba(16,185,129,0.2)"
          : "0 0 25px rgba(59,130,246,0.5), 0 0 50px rgba(59,130,246,0.2)"
        : undefined
    }}
    >
      {/* Accent bar with gradient based on status */}
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-xl"
        style={{ 
          background: hasLiveData 
            ? isHitting 
              ? "linear-gradient(90deg, #10b981, #34d399)" 
              : isPacing 
              ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
              : "linear-gradient(90deg, #ef4444, #f87171)"
            : teamColors?.primary || "#3b82f6"
        }}
      />
      
      {/* Game status badge */}
      <div className="absolute top-2 left-2">
        {isLive ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-medium">
            <Radio className="w-2.5 h-2.5 animate-pulse" />
            LIVE
          </span>
        ) : isFinal ? (
          <span className="px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400 text-[10px] font-medium">
            FINAL
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-500 text-[10px]">
            {gameData ? formatGameTime(gameData.start_time) : prop.sport.toUpperCase()}
          </span>
        )}
      </div>
      
      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20"
      >
        <Trash2 className="w-3 h-3 text-red-400" />
      </button>

      <div className="flex items-center gap-4 mt-4">
        {/* Progress Ring */}
        {hasLiveData ? (
          <ProgressRing 
            current={currentValue} 
            target={lineValue} 
            isHitting={isHitting}
            isPacing={isPacing}
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
            <div className="text-center">
              <span className="text-lg font-bold text-white">{lineValue}</span>
              <span className="block text-[10px] text-slate-500 uppercase">{prop.selection}</span>
            </div>
          </div>
        )}

        <PlayerPhoto
          playerName={prop.player_name}
          sport={String(prop.sport || "").toLowerCase() || "nba"}
          size={42}
          className="border border-white/10 bg-slate-800 flex-shrink-0"
        />

        {/* Player & Prop Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white truncate">{prop.player_name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-2">
            <span>{prop.team}</span>
            <span className="text-slate-600">•</span>
            <span className="font-medium text-slate-300">{prop.selection} {lineValue} {formatPropType(prop.prop_type)}</span>
          </div>
          
          {/* Progress bar */}
          {hasLiveData && (
            <div className="space-y-1">
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isHitting ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
                    isPacing ? "bg-gradient-to-r from-amber-500 to-amber-400" :
                    "bg-gradient-to-r from-red-500 to-red-400"
                  )}
                  style={{ 
                    width: `${progressPercent}%`,
                    boxShadow: isHitting ? "0 0 10px rgba(16,185,129,0.5)" : undefined
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={cn(
                  "font-medium",
                  isHitting ? "text-emerald-400" : isPacing ? "text-amber-400" : "text-red-400"
                )}>
                  {currentValue}/{lineValue} {formatPropTypeLong(prop.prop_type)}
                </span>
                {isHitting ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    HIT
                  </span>
                ) : (
                  <span className="text-slate-500">
                    {Math.max(0, lineValue - currentValue)} to go
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Odds display when no live data */}
          {!hasLiveData && prop.odds_american && (
            <div className="flex items-center gap-2 text-sm">
              <span className={cn(
                "font-medium",
                prop.odds_american > 0 ? "text-emerald-400" : "text-slate-300"
              )}>
                {prop.odds_american > 0 ? "+" : ""}{prop.odds_american}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Game context */}
      {gameData && (isLive || isFinal) && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
          <span>{gameData.away_team_code} @ {gameData.home_team_code}</span>
          {isLive && (
            <span className="text-slate-400">
              {gameData.period_label} {gameData.clock && `• ${gameData.clock}`}
            </span>
          )}
          {isFinal && (
            <span>{gameData.away_score} - {gameData.home_score}</span>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================
// PLAYER TILE COMPONENT
// =====================================================

interface PlayerTileProps {
  player: WatchboardPlayer;
  onRemove: () => void;
  onClick: () => void;
}

function PlayerTile({ player, onRemove, onClick }: PlayerTileProps) {
  const teamColors = getTeamColors(player.team_abbr || player.team || "");
  const rawSourcePlayerId = String(
    canonicalPlayerIdQueryParam(player.player_id)
    || canonicalPlayerIdQueryParam((player as any).playerId)
    || canonicalPlayerIdQueryParam((player as any).espn_id)
    || canonicalPlayerIdQueryParam((player as any).espnId)
    || ""
  ).trim();
  const pid = canonicalPlayerIdQueryParam(rawSourcePlayerId) || "";
  const canNavigate = Boolean(pid);
  
  // Format sport display
  const formatSport = (sport: string) => {
    return sport.toUpperCase();
  };

  return (
    <div
      onClick={canNavigate ? onClick : undefined}
      onMouseEnter={() => {
        if (!pid) return;
        void prefetchFullPlayerProfileSnapshot({
          sport: player.sport,
          playerId: pid,
          timeoutMs: 22_000,
        });
      }}
      className={cn(
        "relative group rounded-xl border border-white/10 bg-slate-900/80 backdrop-blur-sm p-4 transition-all",
        canNavigate
          ? "hover:border-purple-500/30 hover:bg-slate-800/90 cursor-pointer"
          : "opacity-70 cursor-default"
      )}
      title={canNavigate ? undefined : "Player profile unavailable"}
    >
      {/* Team color accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-xl"
        style={{ background: teamColors?.primary || "#8b5cf6" }}
      />
      
      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-red-500/20"
      >
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </button>

      <div className="flex items-center gap-3 mt-1">
        {/* Player Photo */}
        <div className="relative flex-shrink-0">
          {player.headshot_url ? (
            <img
              src={player.headshot_url}
              alt={player.player_name}
              className="w-14 h-14 rounded-full object-cover bg-slate-800 border-2 border-white/10"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={cn(
            "w-14 h-14 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border-2 border-white/10",
            player.headshot_url && "hidden"
          )}>
            <User className="w-7 h-7 text-purple-400" />
          </div>
          
          {/* Sport badge */}
          <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-slate-800 border border-white/10 text-[9px] font-bold text-slate-300">
            {formatSport(player.sport)}
          </div>
        </div>

        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-white truncate">{player.player_name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {player.team_abbr && (
              <span className="text-slate-300 font-medium">{player.team_abbr}</span>
            )}
            {player.position && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{player.position}</span>
              </>
            )}
          </div>
          
          {/* Tracked prop if any */}
          {player.prop_type && player.prop_line !== null && (
            <div className="flex items-center gap-2 mt-1.5">
              <Target className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-slate-400">
                {player.prop_selection} {player.prop_line} {player.prop_type}
              </span>
              {player.current_stat_value !== null && (
                <span className={cn(
                  "text-xs font-semibold",
                  player.current_stat_value >= player.prop_line ? "text-emerald-400" : "text-amber-400"
                )}>
                  ({player.current_stat_value})
                </span>
              )}
            </div>
          )}
        </div>

        {/* View indicator */}
        <ChevronRight className="w-5 h-5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
    </div>
  );
}

// =====================================================
// COACH G WATCHER COMPONENT
// =====================================================

const COACH_G_WATCHBOARD_REACTIONS = {
  scoring: [
    "💧 Splash! That's the shot you want!",
    "🔥 Big bucket right there!",
    "💰 Money! That's how you do it!",
    "⚡ What a play! Keep watching!",
    "🎯 That's textbook execution!",
  ],
  bigPlay: [
    "👀 Did you see that?!",
    "🔥 That's a momentum play!",
    "💪 Big-time play right there!",
    "⚡ Energy shift!",
    "🎯 That's what I'm talking about!",
  ],
  watching: [
    "👀 Keeping eyes on all your games...",
    "📺 Tracking all the action for you!",
    "🎯 Watching these matchups closely...",
    "⚡ Ready for something big!",
    "🏀 Multiple games, maximum focus!",
  ],
  idle: [
    "Waiting for the next big play...",
    "All quiet for now, stay ready!",
    "Monitoring the action...",
    "Eyes on the board!",
  ],
};

interface CoachGReaction {
  id: string;
  message: string;
  gameId: string;
  teamCode: string;
  timestamp: number;
}

interface CoachGWatcherProps {
  games: GameData[];
  latestPlays: Record<string, LatestPlay>;
  liveGameCount: number;
  userId?: string;
}

function CoachGWatcher({ games, latestPlays, liveGameCount, userId }: CoachGWatcherProps) {
  const [reactions, setReactions] = useState<CoachGReaction[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const processedPlaysRef = useRef<Set<string>>(new Set());
  
  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [showChat, setShowChat] = useState(false);
  
  // Process new plays and generate reactions
  useEffect(() => {
    const newReactions: CoachGReaction[] = [];
    
    Object.entries(latestPlays).forEach(([gameId, play]) => {
      if (!play) return;
      
      // Create a unique key for this play
      const playKey = `${gameId}-${play.description}-${play.team}`;
      if (processedPlaysRef.current.has(playKey)) return;
      processedPlaysRef.current.add(playKey);
      
      // Only react to scoring or major plays
      if (play.isScoring || play.isMajor) {
        const reactionList = play.isScoring 
          ? COACH_G_WATCHBOARD_REACTIONS.scoring 
          : COACH_G_WATCHBOARD_REACTIONS.bigPlay;
        const message = reactionList[Math.floor(Math.random() * reactionList.length)];
        
        newReactions.push({
          id: `${Date.now()}-${gameId}`,
          message,
          gameId,
          teamCode: play.team || "",
          timestamp: Date.now(),
        });
      }
    });
    
    if (newReactions.length > 0) {
      setReactions(prev => [...newReactions, ...prev].slice(0, 5));
    }
  }, [latestPlays]);
  
  // Set idle/watching message when no recent reactions
  useEffect(() => {
    if (reactions.length === 0) {
      const msgList = liveGameCount > 0 
        ? COACH_G_WATCHBOARD_REACTIONS.watching 
        : COACH_G_WATCHBOARD_REACTIONS.idle;
      setCurrentMessage(msgList[Math.floor(Math.random() * msgList.length)]);
    }
  }, [liveGameCount, reactions.length]);
  
  // Clear old reactions after 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 30000;
      setReactions(prev => prev.filter(r => r.timestamp > cutoff));
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  
  const latestReaction = reactions[0];
  const game = latestReaction 
    ? games.find(g => g.game_id === latestReaction.gameId) 
    : null;

  // Ask Coach G a question
  const askCoachG = async () => {
    if (!chatInput.trim() || isAsking) return;
    
    setIsAsking(true);
    setChatResponse("");
    
    // Build game context for Coach G
    const gameContext = games.map(g => {
      const status = g.status === 'live' ? 'LIVE' : g.status === 'final' ? 'FINAL' : 'SCHEDULED';
      return `${g.away_team_name || g.away_team_code} (${g.away_score ?? 0}) @ ${g.home_team_name || g.home_team_code} (${g.home_score ?? 0}) - ${status}${g.clock ? ` ${g.clock}` : ''}`;
    }).join('\n');
    
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId && { 'x-user-id': userId }),
        },
        body: JSON.stringify({
          persona: 'coach',
          message: chatInput,
          pageContext: `Watchboard - User is tracking these games:\n${gameContext || 'No games currently being watched'}`,
          conversationHistory: [],
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setChatResponse(data.response || data.message || "I'm keeping my eye on these games for you!");
      } else {
        setChatResponse("Sorry, I couldn't process that right now. Keep watching!");
      }
    } catch {
      setChatResponse("Connection issue - but I'm still watching your games!");
    } finally {
      setIsAsking(false);
      setChatInput("");
    }
  };

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-slate-900/50 to-purple-500/5 backdrop-blur-sm p-4 mb-6">
      <div className="flex items-start gap-4">
        {/* Coach G Avatar */}
        <div className="relative flex-shrink-0">
          <div className={cn(
            "w-14 h-14 rounded-full overflow-hidden border-2 transition-all duration-300",
            latestReaction ? "border-amber-400 animate-pulse" : "border-slate-600"
          )}>
            <CoachGAvatar
              size="sm"
              presence={latestReaction ? "alert" : "monitoring"}
              className="h-full w-full rounded-full border-0"
            />
          </div>
          {/* Live indicator */}
          {liveGameCount > 0 && (
            <div className="absolute -bottom-1 -right-1 flex items-center gap-1 px-1.5 py-0.5 bg-red-500 rounded-full">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-white">LIVE</span>
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white">Coach G</span>
            <MessageCircle className="w-4 h-4 text-amber-400" />
            {games.length > 0 && (
              <span className="text-xs text-slate-500">
                Watching {games.length} {games.length === 1 ? "game" : "games"}
              </span>
            )}
          </div>
          
          {latestReaction ? (
            <div className="space-y-1">
              <p className="text-amber-300 font-medium animate-fade-in">
                {latestReaction.message}
              </p>
              {game && (
                <p className="text-xs text-slate-400">
                  {game.away_team_code} @ {game.home_team_code}
                </p>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">
              {currentMessage || "Ready to watch your games!"}
            </p>
          )}
          
          {/* Recent reactions feed */}
          {reactions.length > 1 && !showChat && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-xs text-slate-500 mb-2">Recent reactions:</p>
              <div className="space-y-1">
                {reactions.slice(1, 4).map((r) => {
                  const g = games.find(gm => gm.game_id === r.gameId);
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">
                        {g ? `${g.away_team_code}@${g.home_team_code}` : ""}
                      </span>
                      <span className="text-slate-400 truncate">{r.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Chat Response */}
          {chatResponse && (
            <div className="mt-3 pt-3 border-t border-amber-500/20">
              <div className="bg-amber-500/10 rounded-lg p-3">
                <p className="text-sm text-amber-200">{chatResponse}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Ask Coach G Section */}
      <div className="mt-4 pt-4 border-t border-white/10">
        {!showChat ? (
          <button
            onClick={() => setShowChat(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 transition-all text-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Ask Coach G a question</span>
            <CoachGExternalLinkIcon />
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your games..."
                className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/50"
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askCoachG()}
                disabled={isAsking}
              />
              <Button
                onClick={askCoachG}
                disabled={!chatInput.trim() || isAsking}
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-black px-3"
              >
                {isAsking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <button
              onClick={() => {
                setShowChat(false);
                setChatResponse("");
              }}
              className="text-xs text-slate-500 hover:text-slate-400"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// MAIN PAGE COMPONENT
// =====================================================

export function WatchboardPage() {
  const navigate = useNavigate();
  const { id: urlBoardId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const queryBoardId = searchParams.get("board");
  const { subscription } = useSubscription();
  const { isMuted, toggleMute, playSound } = useSoundEffects();
  const {
    boards,
    activeBoard,
    gameIds,
    props,
    players,
    isLoading,
    createBoard,
    switchBoard,
    renameBoard,
    deleteBoard,
    removeGame,
    removeProp,
    unfollowPlayer,
    setPinnedGame,
    reorderGames,
    refetch,
  } = useWatchboards();
  const { user } = useDemoAuth();
  
  // Get cached watchboard data from shared hub for instant display
  const { boards: hubWatchboards, loading: _hubLoading } = useDataHubWatchboards();

  // Auto-switch to board from URL param
  useEffect(() => {
    const requestedBoardId = String(urlBoardId || queryBoardId || "").trim();
    if (requestedBoardId && boards.length > 0) {
      const targetId = parseInt(requestedBoardId, 10);
      if (!isNaN(targetId) && activeBoard?.id !== targetId) {
        const boardExists = boards.some(b => b.id === targetId);
        if (boardExists) {
          switchBoard(targetId);
        }
      }
    }
  }, [urlBoardId, queryBoardId, boards, activeBoard?.id, switchBoard]);

  const [games, setGames] = useState<GameData[]>([]);
  // All boards with games for multi-board display
  const [allBoardsData, setAllBoardsData] = useState<Array<{ board: Watchboard; gameIds: string[]; games: GameData[] }>>([]);
  const [latestPlays, setLatestPlays] = useState<Record<string, LatestPlay>>({});
  const [propStats, setPropStats] = useState<Record<number, number | null>>({});
  // Track which props just had stat updates (for glow animation)
  const [updatedPropIds, setUpdatedPropIds] = useState<Set<number>>(new Set());
  // Track which props just hit their target
  const [hitTargetPropIds, setHitTargetPropIds] = useState<Set<number>>(new Set());
  // Track which props just fell behind (not pacing anymore)
  const [behindPropIds, setBehindPropIds] = useState<Set<number>>(new Set());
  // Ref to track previous stat values for change detection
  const prevPropStatsRef = useRef<Record<number, number | null>>({});
  // Ref to track previous "hitting" status for behind detection
  const prevHittingStatusRef = useRef<Record<number, boolean>>({});
  const [betLegsByGame, setBetLegsByGame] = useState<Record<string, BetLeg[]>>({});
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // Focused board view - null means show all boards, number means show just that board
  const [focusedBoardId, setFocusedBoardId] = useState<number | null>(null);
  const watchboardPageLoggedRef = useRef(false);
  const watchboardPagePerfStartRef = useRef(Date.now());
  const watchboardPageFirstRenderMsRef = useRef<number | null>(null);
  const watchboardPageHydrationDoneMsRef = useRef<number | null>(null);
  const WATCHBOARD_GAME_FETCH_TIMEOUT_MS = 7000;
  const WATCHBOARD_PREVIEW_TIMEOUT_MS = 8000;

  // Tier limits
  const tierLimits = getTierLimits(subscription?.tier);
  const _canAddGame = gameIds.length < tierLimits.maxGames;
  void _canAddGame; // Reserved for future "Add to Watchboard" button gating
  const canUseProps = tierLimits.hasProps;
  const _atGameLimit = gameIds.length >= tierLimits.maxGames;
  void _atGameLimit; // Reserved for future game limit UI

  // Helper to fetch a single game by ID (handles soccer games separately)
  const fetchSingleGame = useCallback(async (id: string): Promise<GameData | null> => {
    const fetchJsonWithTimeout = async <T,>(url: string, timeoutMs = WATCHBOARD_GAME_FETCH_TIMEOUT_MS): Promise<T> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      // Soccer games use sr:match: prefix - fetch from soccer API
      if (id.startsWith("sr:match:") || id.startsWith("sr:sport_event:")) {
        const data = await fetchJsonWithTimeout<{ match?: any }>(`/api/soccer/match/${encodeURIComponent(id)}`);
        if (!data.match) return null;
        // Transform soccer match to GameData format
        return {
          game_id: data.match.eventId || id,
          sport: "soccer",
          status: data.match.status || "SCHEDULED",
          start_time: data.match.startTime || new Date().toISOString(),
          home_team_name: data.match.homeTeam?.name || "Home",
          away_team_name: data.match.awayTeam?.name || "Away",
          home_team_code: data.match.homeTeam?.abbreviation || data.match.homeTeam?.name?.substring(0, 3).toUpperCase() || "HOM",
          away_team_code: data.match.awayTeam?.abbreviation || data.match.awayTeam?.name?.substring(0, 3).toUpperCase() || "AWY",
          home_score: data.match.homeScore ?? null,
          away_score: data.match.awayScore ?? null,
          period_label: data.match.period || null,
          clock: data.match.clock || null,
        };
      }
      // Standard games - fetch from games API
      const data = await fetchJsonWithTimeout<any>(`/api/games/${encodeURIComponent(id)}?lite=1`);
      const game = data.game || data;
      if (game?.home_team_code || game?.home_team_name) return game;

      // Legacy ESPN watchboard IDs can fail direct lookup; resolve from sport slate.
      const espnMatch = String(id || "").match(/^espn_([a-z0-9]+)_(.+)$/i);
      if (espnMatch) {
        const sport = String(espnMatch[1] || "").toLowerCase();
        const token = String(espnMatch[2] || "").trim();
        const slate = await fetchJsonWithTimeout<{ games?: any[] }>(`/api/games?sport=${encodeURIComponent(sport)}&includeOdds=0`);
        const rows = Array.isArray(slate.games) ? slate.games : [];
        for (const row of rows) {
          const blob = JSON.stringify(row);
          if (blob.includes(token)) return row as GameData;
        }
      }
      return null;
    } catch { return null; }
  }, [WATCHBOARD_GAME_FETCH_TIMEOUT_MS]);

  // Fetch game data for all game IDs (legacy - still used for active board)
  const fetchGames = useCallback(async () => {
    if (gameIds.length === 0) {
      setGames([]);
      return;
    }
    setLoadingGames(true);
    try {
      const results = await Promise.all(gameIds.map(fetchSingleGame));
      setGames(results.filter(Boolean) as GameData[]);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch games:", err);
    } finally {
      setLoadingGames(false);
    }
  }, [gameIds, fetchSingleGame]);

  // Fetch ALL boards with their games for multi-board display
  const fetchAllBoardsWithGames = useCallback(async () => {
    if (!user?.id) return;
    const isResolvedGameData = (game: GameData | undefined | null): game is GameData => {
      if (!game) return false;
      const hasCodes = Boolean(
        game.home_team_code
        && game.home_team_code !== "TBD"
        && game.away_team_code
        && game.away_team_code !== "TBD"
      );
      const hasNames = Boolean(game.home_team_name && game.away_team_name);
      const hasKnownSport = String(game.sport || "").toLowerCase() !== "unknown";
      return (hasCodes || hasNames) && hasKnownSport;
    };
    setLoadingGames(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WATCHBOARD_PREVIEW_TIMEOUT_MS);
      let boardsRes: Response;
      try {
        // Get all boards with game IDs
        boardsRes = await fetch("/api/watchboards/home-preview", {
          headers: { "x-user-id": user.id.toString() },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!boardsRes.ok) {
        throw new Error(`watchboards preview failed: ${boardsRes.status}`);
      }
      const boardsData = await boardsRes.json();
      const rawBoardsList = Array.isArray(boardsData?.boards) ? boardsData.boards : [];
      const seenBoardIds = new Set<number>();
      const boardsList = rawBoardsList.filter((board: any) => {
        const id = Number(board?.id);
        const name = String(board?.name || "").trim();
        if (!Number.isFinite(id) || id <= 0 || !name) return false;
        if (seenBoardIds.has(id)) return false;
        seenBoardIds.add(id);
        return true;
      });

      // Seed map from payload rows only.
      const gameMap: Record<string, GameData> = {};
      boardsList.forEach((b: { gameIds?: string[]; games?: GameData[] }) => {
        (b.games || []).forEach((g) => {
          const gid = String(g?.game_id || "").trim();
          if (!gid) return;
          if (isRenderableWatchboardGame(g)) {
            gameMap[gid] = g;
          }
        });
      });

      // Build boards with their games
      const boardsWithGames = boardsList.map((b: Watchboard & { gameIds: string[] }) => ({
        board: b,
        gameIds: b.gameIds || [],
        games: (b.gameIds || []).map((id: string) => gameMap[id]).filter(Boolean) as GameData[],
      }));
      console.log("[WATCHBOARD PAGE HYDRATE]", {
        boards: boardsWithGames.length,
        items: boardsWithGames.reduce((sum, board) => sum + (board.gameIds?.length || 0), 0),
      });

      setAllBoardsData((prev) => boardsWithGames.map((nextBoard) => {
        const prevBoard = prev.find((entry) => entry.board.id === nextBoard.board.id);
        if (!prevBoard) return nextBoard;
        const nextGameMap = new Map(nextBoard.games.map((g) => [String(g.game_id || "").trim(), g]));
        const prevGameMap = new Map(prevBoard.games.map((g) => [String(g.game_id || "").trim(), g]));
        const mergedGames = nextBoard.gameIds
          .map((id) => {
            const key = String(id || "").trim();
            const nextGame = nextGameMap.get(key);
            const prevGame = prevGameMap.get(key);
            if (!nextGame) return prevGame || null;
            if (!prevGame) return nextGame;
            return isResolvedGameData(nextGame) ? nextGame : (isResolvedGameData(prevGame) ? prevGame : nextGame);
          })
          .filter(Boolean) as GameData[];
        return {
          ...nextBoard,
          games: mergedGames,
        };
      }));
      setLastRefresh(new Date());
      watchboardPageHydrationDoneMsRef.current = Date.now() - watchboardPagePerfStartRef.current;
      const itemCount = boardsWithGames.reduce((sum, board) => sum + (board.gameIds?.length || 0), 0);
      console.log("[WATCHBOARD PAGE PERF]", {
        firstRenderMs: watchboardPageFirstRenderMsRef.current,
        hydrationDoneMs: watchboardPageHydrationDoneMsRef.current,
        itemCount,
      });
    } catch (err) {
      console.error("Failed to fetch all boards:", err);
    } finally {
      setLoadingGames(false);
    }
  }, [user?.id, WATCHBOARD_PREVIEW_TIMEOUT_MS]);

  // Hydrate from hub data immediately (instant navigation)
  useEffect(() => {
    if (hubWatchboards && hubWatchboards.length > 0 && allBoardsData.length === 0) {
      // Transform hub data to local format for instant display
      // Hub returns {id, name, gameIds, games, hasActiveGames}, local needs {board: Watchboard, gameIds, games}
      const boardsWithGames = hubWatchboards
        .filter((b) => Number.isFinite(Number(b?.id)) && Number(b.id) > 0 && String(b?.name || "").trim().length > 0)
        .map((b) => ({
        board: {
          id: b.id,
          name: b.name,
          created_at: '',
          updated_at: '',
        } as Watchboard,
        gameIds: b.gameIds || [],
        games: (b.games || []).filter(isRenderableWatchboardGame) as GameData[],
      }));
      setAllBoardsData(boardsWithGames);
    }
  }, [hubWatchboards, allBoardsData.length]);

  useEffect(() => {
    if (watchboardPageLoggedRef.current) return;
    const sourceBoards = allBoardsData.length > 0
      ? allBoardsData.map((entry) => ({ id: entry.board.id, gameIds: entry.gameIds || [] }))
      : boards.map((board) => ({ id: board.id, gameIds: board.id === activeBoard?.id ? gameIds : [] }));
    const ids = Array.from(new Set(sourceBoards.flatMap((board) => board.gameIds.map((id) => String(id || "").trim()).filter(Boolean))));
    console.log("[WATCHBOARD PAGE DATA]", {
      boardCount: sourceBoards.length,
      itemCounts: sourceBoards.map((board) => board.gameIds.length),
      ids,
    });
    watchboardPageLoggedRef.current = true;
  }, [activeBoard?.id, allBoardsData, boards, gameIds]);

  useEffect(() => {
    if (watchboardPageFirstRenderMsRef.current !== null) return;
    if (isLoading && allBoardsData.length === 0 && boards.length === 0) return;
    watchboardPageFirstRenderMsRef.current = Date.now() - watchboardPagePerfStartRef.current;
    const itemCount = allBoardsData.length > 0
      ? allBoardsData.reduce((sum, board) => sum + (board.gameIds?.length || 0), 0)
      : gameIds.length;
    console.log("[WATCHBOARD PAGE PERF]", {
      firstRenderMs: watchboardPageFirstRenderMsRef.current,
      hydrationDoneMs: watchboardPageHydrationDoneMsRef.current,
      itemCount,
    });
  }, [allBoardsData, boards.length, gameIds.length, isLoading]);

  useEffect(() => {
    fetchGames();
    // Always hydrate from /home-preview immediately so cached UNKNOWN rows do not linger.
    fetchAllBoardsWithGames();
    // Refresh every 30 seconds for live games
    const interval = setInterval(() => {
      fetchGames();
      fetchAllBoardsWithGames();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchGames, fetchAllBoardsWithGames]);

  // Fetch bet leg statuses for games on the watchboard
  const fetchBetLegs = useCallback(async () => {
    if (gameIds.length === 0) {
      setBetLegsByGame({});
      return;
    }

    try {
      const res = await fetch("/api/bet-tickets/legs-by-games", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(user?.id ? { "x-user-id": user.id.toString() } : {}),
        },
        body: JSON.stringify({ game_ids: gameIds }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setBetLegsByGame(data.legs || {});
    } catch (err) {
      console.error("Failed to fetch bet legs:", err);
    }
  }, [gameIds]);

  useEffect(() => {
    fetchBetLegs();
    // Refresh bet status every 30 seconds for live updates
    const interval = setInterval(fetchBetLegs, 30000);
    return () => clearInterval(interval);
  }, [fetchBetLegs]);

  // Fetch latest plays for live games
  const fetchLatestPlays = useCallback(async () => {
    const liveGames = games.filter(
      (g) => g.status === "IN_PROGRESS" || g.status === "live"
    );
    if (liveGames.length === 0) return;

    const playResults = await Promise.all(
      liveGames.map(async (game) => {
        try {
          const res = await fetch(`/api/games/${game.game_id}/playbyplay`);
          if (!res.ok) return null;
          const data = await res.json();
          const plays = data.plays || [];
          if (plays.length === 0) return null;
          const latestPlay = plays[plays.length - 1];
          return {
            gameId: game.game_id,
            play: {
              description: latestPlay.description || "",
              team: latestPlay.team,
              isMajor: latestPlay.isMajor || false,
              isScoring: latestPlay.isScoring || false,
              points: latestPlay.points || 0,
              playerName: latestPlay.playerName || null,
            } as LatestPlay,
          };
        } catch {
          return null;
        }
      })
    );

    const newPlays: Record<string, LatestPlay> = {};
    playResults.forEach((result) => {
      if (result) {
        newPlays[result.gameId] = result.play;
      }
    });
    setLatestPlays((prev) => ({ ...prev, ...newPlays }));
  }, [games]);

  useEffect(() => {
    fetchLatestPlays();
    // Refresh plays every 15 seconds for more responsive updates
    const interval = setInterval(fetchLatestPlays, 15000);
    return () => clearInterval(interval);
  }, [fetchLatestPlays]);

  // Fetch live stats for player props
  const fetchPropStats = useCallback(async () => {
    if (props.length === 0) return;
    
    // Only fetch if we have live games with props
    const liveGameIds = new Set(
      games
        .filter(g => g.status === "IN_PROGRESS" || g.status === "live")
        .map(g => g.game_id)
    );
    const hasLiveProps = props.some(p => liveGameIds.has(p.game_id));
    if (!hasLiveProps && Object.keys(propStats).length > 0) return;

    try {
      const res = await fetch("/api/watchboards/props/stats");
      if (!res.ok) return;
      const data = await res.json();
      if (data.stats && typeof data.stats === 'object') {
        const newStats = data.stats as Record<number, number | null>;
        const prevStats = prevPropStatsRef.current;
        
        // Detect which props had stat increases
        const newlyUpdated = new Set<number>();
        const newlyHitTarget = new Set<number>();
        const newlyBehind = new Set<number>();
        
        for (const prop of props) {
          const propId = prop.id;
          const newVal = newStats[propId];
          const prevVal = prevStats[propId];
          const lineValue = prop.line_value;
          const isOver = prop.selection?.toLowerCase() === 'over';
          
          // Calculate current pacing status
          const currentIsPacing = newVal !== null && newVal !== undefined
            ? (isOver ? newVal >= lineValue * 0.6 : newVal <= lineValue * 1.4)
            : false;
          const currentIsHitting = newVal !== null && newVal !== undefined
            ? (isOver ? newVal >= lineValue : newVal <= lineValue)
            : false;
          
          // Check if we had a previous pacing status
          const wasPacing = prevHittingStatusRef.current[propId] ?? false;
          
          // Only trigger if we have both values and stat increased
          if (newVal !== null && newVal !== undefined && 
              prevVal !== null && prevVal !== undefined && 
              newVal > prevVal) {
            newlyUpdated.add(propId);
            
            // Check if this update just hit or crossed the target
            const wasHitting = isOver ? prevVal >= lineValue : prevVal <= lineValue;
            const nowHitting = isOver ? newVal >= lineValue : newVal <= lineValue;
            
            if (!wasHitting && nowHitting) {
              newlyHitTarget.add(propId);
              playSound('propHit');
            } else {
              playSound('statUpdate');
            }
          }
          
          // Detect falling behind - was pacing/hitting but now NOT pacing
          if (wasPacing && !currentIsPacing && !currentIsHitting) {
            newlyBehind.add(propId);
            playSound('propBehind');
          }
          
          // Update pacing status tracking
          prevHittingStatusRef.current[propId] = currentIsPacing || currentIsHitting;
        }
        
        // Update animation states
        if (newlyUpdated.size > 0) {
          setUpdatedPropIds(newlyUpdated);
          // Clear animation after 2 seconds
          setTimeout(() => setUpdatedPropIds(new Set()), 2700); // ~3 pulse cycles at 0.9s each
        }
        
        if (newlyHitTarget.size > 0) {
          setHitTargetPropIds(newlyHitTarget);
          // Clear hit animation after 3 seconds
          setTimeout(() => setHitTargetPropIds(new Set()), 3500); // 1.4s animation + lingering glow
        }
        
        if (newlyBehind.size > 0) {
          setBehindPropIds(newlyBehind);
          // Clear behind animation after 4 seconds (3 pulse cycles)
          setTimeout(() => setBehindPropIds(new Set()), 3000); // 0.7s × 4 cycles + buffer
        }
        
        // Store current stats for next comparison
        prevPropStatsRef.current = newStats;
        setPropStats(newStats);
      }
    } catch (err) {
      console.error("Failed to fetch prop stats:", err);
    }
  }, [props, games, propStats, playSound]);

  useEffect(() => {
    if (props.length > 0) {
      fetchPropStats();
      // Refresh stats every 30 seconds
      const interval = setInterval(fetchPropStats, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchPropStats, props.length]);

  // Sort games: pinned first, then by status (live, upcoming, final)
  const sortedGames = useMemo(() => {
    const pinnedId = activeBoard?.pinned_game_id;
    return [...games].sort((a, b) => {
      // Pinned game first
      if (a.game_id === pinnedId) return -1;
      if (b.game_id === pinnedId) return 1;
      
      // Then by status: live > upcoming > final
      const statusOrder = (status: string) => {
        if (status === "IN_PROGRESS" || status === "live") return 0;
        if (status === "SCHEDULED" || status === "scheduled") return 1;
        return 2;
      };
      return statusOrder(a.status) - statusOrder(b.status);
    });
  }, [games, activeBoard?.pinned_game_id]);
  
  // Create a lookup map for games by game_id (for props to find their game context)
  const gamesMap = useMemo(() => {
    const map: Record<string, GameData> = {};
    // Include games from active board
    games.forEach(g => { map[g.game_id] = g; });
    // Also include games from all boards data
    allBoardsData.forEach(b => {
      b.games.forEach(g => { map[g.game_id] = g; });
    });
    return map;
  }, [games, allBoardsData]);

  // Grid layout based on count - 2-col on mobile for watchboard density
  const gridClass = useMemo(() => {
    const count = sortedGames.length;
    if (count === 1) return "grid-cols-1 max-w-lg mx-auto";
    // Mobile: always 2-col for watchboard feel, expand on larger screens
    if (count <= 4) return "grid-cols-2 lg:grid-cols-2";
    return "grid-cols-2 lg:grid-cols-3";
  }, [sortedGames.length]);

  const handleGameClick = (game: GameData) => {
    navigate(toGameDetailPath(game.sport, game.game_id));
  };

  const handlePlayerClick = (player: WatchboardPlayer) => {
    const rawSourcePlayerId = String(
      canonicalPlayerIdQueryParam(player.player_id)
      || canonicalPlayerIdQueryParam((player as any).playerId)
      || canonicalPlayerIdQueryParam((player as any).espn_id)
      || canonicalPlayerIdQueryParam((player as any).espnId)
      || ""
    ).trim();
    logPlayerNavigation(rawSourcePlayerId || player.player_name, player.sport);
    void navigateToPlayerProfile(navigate, player.sport, rawSourcePlayerId, {
      displayName: player.player_name,
      source: "WatchboardPlayerTile",
    });
  };

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  }, [draggedIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((targetIndex: number) => async (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      handleDragEnd();
      return;
    }

    // Reorder locally first for instant feedback
    const newGames = [...sortedGames];
    const [draggedGame] = newGames.splice(draggedIndex, 1);
    newGames.splice(targetIndex, 0, draggedGame);
    
    // Update local state
    setGames(newGames);
    
    // Get new order of game IDs and persist
    const newOrder = newGames.map(g => g.game_id);
    await reorderGames(newOrder);
    
    handleDragEnd();
  }, [draggedIndex, sortedGames, reorderGames, handleDragEnd]);

  return (
    <>
      <CinematicBackground />
      <div className="relative z-10 min-h-screen pb-20">
        {/* Back Navigation */}
        <div className="px-4 pt-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-3 sm:px-3 sm:py-2 min-h-[44px] rounded-xl bg-white/5 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/10 active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-sm font-medium">Home</span>
          </button>
        </div>

        {/* Header */}
        <div className="px-4 py-4 border-b border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-white">Watchboard</h1>
                  {/* Auto-save indicator */}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">
                    <CheckCircle className="w-3 h-3" />
                    Saved
                  </span>
                </div>
                {isLoading && (
                  <p className="text-blue-300/80 text-xs mb-1">Syncing watchboards in background...</p>
                )}
                <p className="text-slate-400 text-sm">
                  {sortedGames.length} {sortedGames.length === 1 ? "game" : "games"}
                  {props.length > 0 && ` • ${props.length} ${props.length === 1 ? "prop" : "props"}`}
                  {players.length > 0 && ` • ${players.length} ${players.length === 1 ? "player" : "players"}`}
                  {lastRefresh && (
                    <span className="ml-2 text-slate-500">
                      • Updated {lastRefresh.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* Share Button */}
                {allBoardsData.length > 0 && (
                  <ShareButton
                    data={{
                      type: 'watchboard',
                      title: 'My GZ Sports Watchboard',
                      description: `Watching ${allBoardsData.reduce((acc, b) => acc + b.games.length, 0)} games`,
                      boardName: allBoardsData.length === 1 ? (allBoardsData[0]?.board?.name || "Watchboard") : `${allBoardsData.length} Boards`,
                      gameCount: allBoardsData.reduce((acc, b) => acc + b.games.length, 0),
                      liveCount: allBoardsData.flatMap(b => b.games).filter(g => g.status === 'IN_PROGRESS' || g.status === 'live').length,
                    } as ShareData}
                    variant="outline"
                    className="border-white/10 hover:bg-white/5 min-h-[44px] min-w-[44px]"
                  />
                )}
                {/* Prominent New Watchboard Button */}
                {boards.length < tierLimits.maxBoards ? (
                  <Button
                    onClick={() => {
                      const used = new Set(
                        boards
                          .map((board) => {
                            const match = String(board?.name || "").trim().match(/^Board\s+(\d+)$/i);
                            return match ? Number(match[1]) : null;
                          })
                          .filter((value): value is number => Number.isFinite(value) && value > 0)
                      );
                      let nextIndex = 1;
                      while (used.has(nextIndex)) nextIndex += 1;
                      const name = `Board ${nextIndex}`;
                      createBoard(name);
                    }}
                    className="min-h-[44px] gap-2 border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20 active:scale-[0.98]"
                    size="sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">New Board</span>
                  </Button>
                ) : (
                  <Link to="/settings?tab=subscription">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 min-h-[44px]"
                    >
                      <Lock className="w-4 h-4" />
                      <span className="hidden sm:inline">Board Limit</span>
                    </Button>
                  </Link>
                )}
{/* BoardSelector removed - now showing all boards at once */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { refetch(); fetchGames(); fetchBetLegs(); }}
                  disabled={loadingGames}
                  className="gap-2 min-h-[44px] min-w-[44px] active:scale-[0.98]"
                >
                  <RefreshCw className={cn("w-4 h-4", loadingGames && "animate-spin")} />
                  <span className="hidden sm:inline">{loadingGames ? "Refreshing..." : "Refresh"}</span>
                </Button>
                {/* Sound Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                  className={cn(
                    "gap-2 transition-colors min-h-[44px] min-w-[44px] active:scale-[0.98]",
                    !isMuted && "text-emerald-400 hover:text-emerald-300"
                  )}
                  title={isMuted ? "Enable bet status sounds" : "Disable bet status sounds"}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{isMuted ? "Sound Off" : "Sound On"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content - All Boards Display */}
        <div className="px-4 py-6">
          <div className="max-w-6xl mx-auto space-y-8">
            {allBoardsData.length === 0 && sortedGames.length === 0 && props.length === 0 && players.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* Coach G Watching - aggregated across all boards */}
                {allBoardsData.length > 0 && (
                  <CoachGWatcher 
                    games={allBoardsData.flatMap(b => b.games)} 
                    latestPlays={latestPlays}
                    liveGameCount={allBoardsData.flatMap(b => b.games).filter(g => g.status === 'IN_PROGRESS' || g.status === 'live').length}
                    userId={user?.id?.toString()}
                  />
                )}

                {/* All Boards - Each with colored border */}
                {/* Filter to focused board if one is selected */}
                {(() => {
                  const canonicalBoards = allBoardsData.filter((entry) =>
                    entry
                    && entry.board
                    && Number.isFinite(Number(entry.board.id))
                    && Number(entry.board.id) > 0
                    && String(entry.board.name || "").trim().length > 0
                  );
                  const boardsToShow = focusedBoardId !== null
                    ? canonicalBoards.filter((b) => b.board.id === focusedBoardId)
                    : canonicalBoards;
                  const isFocused = focusedBoardId !== null;
                  
                  return (
                    <>
                      {/* Back to All Boards button when focused */}
                      {isFocused && (
                        <button
                          onClick={() => setFocusedBoardId(null)}
                          className="flex items-center gap-2 px-4 py-3 sm:px-4 sm:py-2 min-h-[44px] rounded-xl bg-white/5 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/10 active:scale-[0.98] transition-all mb-4"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          <span className="text-sm font-medium">All Watchboards</span>
                        </button>
                      )}
                      
                      {boardsToShow.map((boardData, _boardIdx) => {
                        // Find actual index in allBoardsData for consistent colors
                        const actualIdx = allBoardsData.findIndex(b => b.board.id === boardData.board.id);
                        const colorIdx = actualIdx >= 0 ? actualIdx : _boardIdx;
                        const colorScheme = BOARD_COLORS[colorIdx % BOARD_COLORS.length] || DEFAULT_BOARD_COLOR;
                        const boardGames = boardData.games.filter(isRenderableWatchboardGame);
                        
                        // When focused, use larger grid layout
                        const boardGridClass = isFocused
                          ? boardGames.length === 1 
                            ? "grid-cols-1" 
                            : boardGames.length === 2 
                            ? "grid-cols-1 sm:grid-cols-2" 
                            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                          : boardGames.length === 1 
                            ? "grid-cols-1" 
                            : boardGames.length <= 4 
                            ? "grid-cols-2" 
                            : "grid-cols-2 lg:grid-cols-3";
                        
                        return (
                          <div 
                            key={boardData.board.id} 
                            className={cn(
                              "rounded-2xl border-2 p-4 transition-all duration-200",
                              colorScheme.border,
                              colorScheme.bg,
                              !isFocused && "cursor-pointer hover:border-opacity-100 hover:scale-[1.01]"
                            )}
                            onClick={(e) => {
                              // Don't focus if clicking on dropdown or buttons
                              if (!isFocused && !(e.target as HTMLElement).closest('button')) {
                                setFocusedBoardId(boardData.board.id);
                              }
                            }}
                          >
                            {/* Board Header */}
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <div className={cn("w-3 h-3 rounded-full", colorScheme.text.replace('text-', 'bg-'))} />
                                <h3 className={cn("font-semibold", colorScheme.text, isFocused && "text-lg")}>
                                  {boardData.board.name}
                                </h3>
                                <span className="text-xs text-slate-500">
                                  ({boardGames.length} {boardGames.length === 1 ? 'game' : 'games'})
                                </span>
                                {!isFocused && (
                                  <ChevronRight className={cn("w-4 h-4 ml-1", colorScheme.text, "opacity-50")} />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isFocused && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate('/games');
                                    }}
                                    className="gap-1.5 text-xs border-white/10 hover:bg-white/5"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Games
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-8 w-8 p-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {!isFocused && (
                                      <DropdownMenuItem onClick={() => setFocusedBoardId(boardData.board.id)}>
                                        <Eye className="h-4 w-4 mr-2" />
                                        Focus View
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => renameBoard(boardData.board.id, prompt('Rename board:', boardData.board.name) || boardData.board.name)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => deleteBoard(boardData.board.id)}
                                      className="text-red-400"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Board
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                            
                            {/* Board Games Grid */}
                            {boardGames.length > 0 ? (
                              <div className={cn("grid gap-3", isFocused && "gap-4", boardGridClass)}>
                                {boardGames.map((game) => (
                                  <GameTile
                                    key={game.game_id}
                                    game={game}
                                    isLarge={isFocused ? boardGames.length <= 2 : boardGames.length === 1}
                                    isPinned={false}
                                    onRemove={() => removeGame(game.game_id)}
                                    onPin={() => {}}
                                    onClick={() => handleGameClick(game)}
                                    latestPlay={latestPlays[game.game_id]}
                                    betLegs={betLegsByGame[game.game_id]}
                                    onStatusSound={!isMuted ? playSound : undefined}
                                    isDragging={false}
                                    isDragOver={false}
                                    onDragStart={() => {}}
                                    onDragEnd={() => {}}
                                    onDragOver={() => {}}
                                    onDragLeave={() => {}}
                                    onDrop={() => {}}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-slate-500">
                                <p>No games on this board</p>
                                {isFocused && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate('/games')}
                                    className="mt-3 gap-2 border-white/10"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Browse Games
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}

                {/* Fallback: If allBoardsData is empty but we have sortedGames from active board */}
                {allBoardsData.length === 0 && sortedGames.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className={cn("grid gap-4", gridClass)}>
                      {sortedGames.map((game, idx) => (
                        <GameTile
                          key={game.game_id}
                          game={game}
                          isLarge={sortedGames.length === 1 || (sortedGames.length <= 4 && idx === 0 && game.game_id === activeBoard?.pinned_game_id)}
                          isPinned={game.game_id === activeBoard?.pinned_game_id}
                          onRemove={() => removeGame(game.game_id)}
                          onPin={() => setPinnedGame(game.game_id === activeBoard?.pinned_game_id ? null : game.game_id)}
                          onClick={() => handleGameClick(game)}
                          latestPlay={latestPlays[game.game_id]}
                          betLegs={betLegsByGame[game.game_id]}
                          onStatusSound={!isMuted ? playSound : undefined}
                          isDragging={draggedIndex === idx}
                          isDragOver={dragOverIndex === idx}
                          onDragStart={handleDragStart(idx)}
                          onDragEnd={handleDragEnd}
                          onDragOver={handleDragOver(idx)}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop(idx)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Props Upgrade Prompt (for non-Pro users) */}
                {!canUseProps && props.length === 0 && (
                  <PropsUpgradePrompt />
                )}

                {/* Player Props Section */}
                {(props.length > 0 && canUseProps) && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5 text-blue-400" />
                      <h2 className="text-lg font-semibold text-white">Player Props</h2>
                      <span className="text-sm text-slate-500">({props.length})</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {props.map((prop) => (
                        <PropTile
                          key={prop.id}
                          prop={prop}
                          onRemove={() => removeProp(prop.id)}
                          liveStatValue={propStats[prop.id]}
                          gameData={prop.game_id ? gamesMap[prop.game_id] : null}
                          justUpdated={updatedPropIds.has(prop.id)}
                          justHitTarget={hitTargetPropIds.has(prop.id)}
                          justFellBehind={behindPropIds.has(prop.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Followed Players Section */}
                {players.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-4">
                      <User className="w-5 h-5 text-purple-400" />
                      <h2 className="text-lg font-semibold text-white">Followed Players</h2>
                      <span className="text-sm text-slate-500">({players.length})</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {players.map((player) => (
                        <PlayerTile
                          key={player.id}
                          player={player}
                          onRemove={() => unfollowPlayer(player.id)}
                          onClick={() => handlePlayerClick(player)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default WatchboardPage;
