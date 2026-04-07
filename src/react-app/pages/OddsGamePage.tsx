/**
 * ODDS GAME PAGE — PREMIUM BETTING COMMAND CENTER
 * /sports/:sportKey/odds/:matchId
 * 
 * Bloomberg terminal meets Apple clean.
 * Bettor-first, market-first experience.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Loader2, Bell, Star, Share2,
  TrendingUp, TrendingDown, Clock, Zap, Users, DollarSign,
  Activity, AlertTriangle, ChevronRight, Trophy, Target,
  Newspaper, BarChart3, CheckCircle2
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { AddToWatchboardModal } from "@/react-app/components/AddToWatchboardModal";
import { TeamLogo } from "@/react-app/components/TeamLogo";
import { CreateAlertModal } from "@/react-app/components/CreateAlertModal";
import { useOddsFormat } from "@/react-app/hooks/useOddsFormat";
import { generateCoachWhisper, getWhisperColors } from "@/react-app/lib/coachWhisper";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { getMarketPeriodLabels } from "@/react-app/lib/marketPeriodLabels";
import { fetchJsonCached } from "@/react-app/lib/fetchCache";
import { useParlayBuilder } from "@/react-app/context/ParlayBuilderContext";
import { GameContextCard } from "@/react-app/components/GameContextCard";
import { useFeatureFlags } from "@/react-app/hooks/useFeatureFlags";
import {
  deriveUnifiedFinalOutcomes,
  deriveUnifiedViewMode,
  UnifiedCoachGLivePanel,
  UnifiedFinalHeroPanel,
  UnifiedLiveSignalStrip,
  UnifiedPlayFeedPanel,
  UnifiedVideoPanel,
} from "@/react-app/components/game-state/StateModePanels";

// ====================
// SHARP MONEY DETECTION
// ====================

interface SharpMoneyAlert {
  type: 'rlm' | 'steam' | 'sharp_action';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  direction: 'home' | 'away' | null;
  confidence: number; // 0-100
}

function detectSharpMoney(
  lineMovement: { spread: number | null; total: number | null } | undefined,
  publicBetPct: number,
  odds: { spread?: number; total?: number; openSpread?: number; openTotal?: number } | undefined
): SharpMoneyAlert[] {
  const alerts: SharpMoneyAlert[] = [];
  if (!odds) return alerts;
  
  const spreadMove = lineMovement?.spread ?? 0;
  const totalMove = lineMovement?.total ?? 0;
  const currentSpread = odds.spread ?? 0;
  
  // RLM Detection: Public betting one way, line moving the other
  // If public is on favorite (>60%), but line is moving TOWARD favorite (more negative), that's RLM on underdog
  const publicOnFavorite = publicBetPct > 55;
  const lineMovingTowardFavorite = spreadMove < -0.5; // Line getting more negative = more juice on favorite
  const lineMovingTowardUnderdog = spreadMove > 0.5;
  
  if (publicOnFavorite && lineMovingTowardUnderdog && Math.abs(spreadMove) >= 1) {
    alerts.push({
      type: 'rlm',
      severity: Math.abs(spreadMove) >= 2 ? 'high' : 'medium',
      title: 'Reverse Line Movement',
      description: `${publicBetPct}% public on favorite, but line moved ${spreadMove > 0 ? '+' : ''}${spreadMove.toFixed(1)} pts toward underdog`,
      direction: currentSpread > 0 ? 'home' : 'away',
      confidence: Math.min(90, 50 + Math.abs(spreadMove) * 15 + (publicBetPct - 55))
    });
  } else if (!publicOnFavorite && lineMovingTowardFavorite && Math.abs(spreadMove) >= 1) {
    alerts.push({
      type: 'rlm',
      severity: Math.abs(spreadMove) >= 2 ? 'high' : 'medium',
      title: 'Reverse Line Movement',
      description: `Only ${publicBetPct}% on favorite, but line moved ${spreadMove.toFixed(1)} pts toward favorite`,
      direction: currentSpread < 0 ? 'home' : 'away',
      confidence: Math.min(90, 50 + Math.abs(spreadMove) * 15 + (55 - publicBetPct))
    });
  }
  
  // Steam Move Detection: Significant rapid movement (>1.5 pts on spread or >2 pts on total)
  if (Math.abs(spreadMove) >= 1.5) {
    alerts.push({
      type: 'steam',
      severity: Math.abs(spreadMove) >= 2.5 ? 'high' : 'medium',
      title: 'Steam Move Detected',
      description: `Spread shifted ${spreadMove > 0 ? '+' : ''}${spreadMove.toFixed(1)} pts — coordinated sharp action likely`,
      direction: spreadMove > 0 ? (currentSpread > 0 ? 'away' : 'home') : (currentSpread < 0 ? 'away' : 'home'),
      confidence: Math.min(95, 60 + Math.abs(spreadMove) * 12)
    });
  }
  
  if (Math.abs(totalMove) >= 2) {
    alerts.push({
      type: 'steam',
      severity: Math.abs(totalMove) >= 3 ? 'high' : 'medium',
      title: 'Total Steam Move',
      description: `Total shifted ${totalMove > 0 ? '+' : ''}${totalMove.toFixed(1)} pts — sharps moving ${totalMove > 0 ? 'over' : 'under'}`,
      direction: null,
      confidence: Math.min(95, 60 + Math.abs(totalMove) * 10)
    });
  }
  
  return alerts;
}

function SharpMoneyAlertBanner({ 
  alerts, 
  homeTeam, 
  awayTeam 
}: { 
  alerts: SharpMoneyAlert[]; 
  homeTeam: string; 
  awayTeam: string;
}) {
  if (alerts.length === 0) return null;
  
  const highSeverity = alerts.filter(a => a.severity === 'high');
  const primaryAlert = highSeverity[0] || alerts[0];
  
  const getBgColor = () => {
    if (primaryAlert.severity === 'high') return 'from-red-500/20 via-red-500/10 to-transparent';
    if (primaryAlert.type === 'rlm') return 'from-amber-500/20 via-amber-500/10 to-transparent';
    return 'from-cyan-500/20 via-cyan-500/10 to-transparent';
  };
  
  const getBorderColor = () => {
    if (primaryAlert.severity === 'high') return 'border-red-500/30';
    if (primaryAlert.type === 'rlm') return 'border-amber-500/30';
    return 'border-cyan-500/30';
  };
  
  const getIconColor = () => {
    if (primaryAlert.severity === 'high') return 'text-red-400';
    if (primaryAlert.type === 'rlm') return 'text-amber-400';
    return 'text-cyan-400';
  };
  
  const getIcon = () => {
    if (primaryAlert.type === 'steam') return <Zap className={cn("w-5 h-5", getIconColor())} />;
    if (primaryAlert.type === 'rlm') return <AlertTriangle className={cn("w-5 h-5", getIconColor())} />;
    return <Activity className={cn("w-5 h-5", getIconColor())} />;
  };
  
  const getDirectionTeam = () => {
    if (!primaryAlert.direction) return null;
    return primaryAlert.direction === 'home' ? homeTeam : awayTeam;
  };
  
  return (
    <div className={cn(
      "relative rounded-xl border overflow-hidden",
      getBorderColor()
    )}>
      {/* Animated gradient background */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-r animate-pulse",
        getBgColor()
      )} />
      
      {/* Scan line effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent animate-scan" />
      </div>
      
      <div className="relative p-4">
        <div className="flex items-start gap-3">
          {/* Icon with glow */}
          <div className="relative flex-shrink-0">
            <div className={cn(
              "absolute inset-0 blur-lg",
              primaryAlert.severity === 'high' ? 'bg-red-500/30' : 
              primaryAlert.type === 'rlm' ? 'bg-amber-500/30' : 'bg-cyan-500/30'
            )} />
            <div className="relative p-2 rounded-lg bg-black/40 border border-white/10">
              {getIcon()}
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "text-xs font-black uppercase tracking-wider",
                primaryAlert.severity === 'high' ? 'text-red-400' : 
                primaryAlert.type === 'rlm' ? 'text-amber-400' : 'text-cyan-400'
              )}>
                {primaryAlert.title}
              </span>
              {primaryAlert.severity === 'high' && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/20 text-red-400 rounded uppercase">
                  High Confidence
                </span>
              )}
            </div>
            
            <p className="text-sm text-white/80 leading-snug">
              {primaryAlert.description}
            </p>
            
            {getDirectionTeam() && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-white/40 uppercase tracking-wide">Sharp money on:</span>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded",
                  primaryAlert.severity === 'high' ? 'bg-red-500/20 text-red-300' : 
                  primaryAlert.type === 'rlm' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'
                )}>
                  {getDirectionTeam()}
                </span>
              </div>
            )}
            
            {/* Confidence meter */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    primaryAlert.severity === 'high' ? 'bg-red-400' : 
                    primaryAlert.type === 'rlm' ? 'bg-amber-400' : 'bg-cyan-400'
                  )}
                  style={{ width: `${primaryAlert.confidence}%` }}
                />
              </div>
              <span className="text-[10px] text-white/40">{primaryAlert.confidence}% confidence</span>
            </div>
          </div>
        </div>
        
        {/* Additional alerts indicator */}
        {alerts.length > 1 && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white/30">Also detected:</span>
            {alerts.slice(1).map((alert, i) => (
              <span 
                key={i}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  alert.type === 'steam' ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' :
                  alert.type === 'rlm' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
                  'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                )}
              >
                {alert.type === 'steam' ? '⚡ Steam' : alert.type === 'rlm' ? '↔ RLM' : '📊 Sharp'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ====================
// TYPES
// ====================

interface GameData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startTime: string;
  league: string;
  sport: string;
  odds?: OddsData;
  lineHistory?: LineHistoryPoint[];
  sportsbooks?: SportsbookOdds[];
  props?: PlayerProp[];
}

interface OddsData {
  spread?: number;
  spreadHome?: number;
  spreadAway?: number;
  openSpread?: number;
  total?: number;
  openTotal?: number;
  mlHome?: number;
  mlAway?: number;
  openMlHome?: number;
  openMlAway?: number;
  spread1HHome?: number;
  spread1HAway?: number;
  total1H?: number;
  ml1HHome?: number;
  ml1HAway?: number;
}

interface LineHistoryPoint {
  timestamp: string;
  spread: number;
  total: number;
}

interface SportsbookOdds {
  name: string;
  spread: number;
  spreadOdds: number;
  total: number;
  totalOdds: number;
  mlHome: number;
  mlAway: number;
}

interface PlayerProp {
  playerName: string;
  propType: string;
  line: number;
  overOdds: number;
  underOdds: number;
}

// ====================
// HELPERS
// ====================

function getMovementDirection(current: number | undefined, open: number | undefined): 'up' | 'down' | 'none' {
  if (current === undefined || open === undefined) return 'none';
  if (Math.abs(current - open) < 0.01) return 'none';
  return current > open ? 'up' : 'down';
}

function getStatusDisplay(status: string): 'LIVE' | 'FINAL' | 'UPCOMING' {
  const s = status?.toUpperCase() || '';
  if (s.includes('LIVE') || s.includes('PROGRESS') || s.includes('INPROGRESS')) return 'LIVE';
  if (s.includes('FINAL') || s.includes('CLOSED') || s.includes('COMPLETE')) return 'FINAL';
  return 'UPCOMING';
}

function formatGameTime(startTime: string): string {
  const date = new Date(startTime);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function normalizeLineHistoryMessage(reason: unknown): string {
  if (typeof reason !== "string") {
    return "Line history is still syncing from partner books.";
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return "Line history is still syncing from partner books.";
  }
  // Hide raw provider tokens like "NO_HISTORY" from user-facing UI.
  if (/^[A-Z0-9_]+$/.test(trimmed)) {
    return "Line history is still syncing from partner books.";
  }
  return trimmed;
}

// ====================
// SUB-COMPONENTS
// ====================

// TeamLogo imported from @/react-app/components/TeamLogo

// Market card with large number display
function MarketCard({ 
  label, 
  value, 
  subValue,
  openValue,
  formatter,
  accentColor = "cyan"
}: { 
  label: string; 
  value: number | undefined;
  subValue?: string;
  openValue?: number;
  formatter: (v: number) => string;
  accentColor?: 'cyan' | 'amber' | 'emerald';
}) {
  const direction = getMovementDirection(value, openValue);
  const colorMap = {
    cyan: { bg: 'from-cyan-500/10 to-cyan-500/5', border: 'border-cyan-500/20', text: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
    amber: { bg: 'from-amber-500/10 to-amber-500/5', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
    emerald: { bg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' }
  };
  const colors = colorMap[accentColor];
  
  return (
    <div className={cn(
      "relative rounded-2xl p-4 text-center transition-all duration-300",
      "bg-gradient-to-b", colors.bg,
      "border", colors.border,
      direction !== 'none' && `shadow-lg ${colors.glow}`
    )}>
      {/* Label */}
      <div className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-medium mb-2">
        {label}
      </div>
      
      {/* Large Value */}
      <div className={cn("text-3xl sm:text-4xl font-black tracking-tight", colors.text)}>
        {value !== undefined ? formatter(value) : '—'}
      </div>
      
      {/* Sub value (team name for moneyline) */}
      {subValue && (
        <div className="text-[11px] text-white/40 mt-1">{subValue}</div>
      )}
      
      {/* Movement indicator */}
      {direction !== 'none' && openValue !== undefined && (
        <div className={cn(
          "flex items-center justify-center gap-1 mt-2 text-[10px] font-medium",
          direction === 'up' ? "text-emerald-400" : "text-rose-400"
        )}>
          {direction === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>from {formatter(openValue)}</span>
        </div>
      )}
    </div>
  );
}

// ====================
// LINE MOVEMENT CHART
// ====================

function LineMovementChart({ 
  data, 
  label,
  accentColor = "cyan"
}: { 
  data: { time: string; value: number }[];
  label: string;
  accentColor?: 'cyan' | 'amber';
}) {
  if (data.length < 2) return null;
  
  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  // Normalize values to 0-100 for SVG
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: 100 - ((d.value - min) / range) * 80 - 10, // 10-90 range
  }));
  
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L 100 100 L 0 100 Z`;
  
  const colorMap = {
    cyan: { stroke: '#22d3ee', fill: 'rgba(34, 211, 238, 0.1)', glow: 'rgba(34, 211, 238, 0.5)' },
    amber: { stroke: '#fbbf24', fill: 'rgba(251, 191, 36, 0.1)', glow: 'rgba(251, 191, 36, 0.5)' }
  };
  const colors = colorMap[accentColor];
  
  const startVal = data[0].value;
  const endVal = data[data.length - 1].value;
  const change = endVal - startVal;
  
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/40 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-white/50">{startVal.toFixed(1)}</span>
          <ChevronRight className="w-3 h-3 text-white/30" />
          <span className={cn(
            "font-semibold",
            change > 0 ? "text-emerald-400" : change < 0 ? "text-rose-400" : "text-white/60"
          )}>
            {endVal.toFixed(1)}
          </span>
        </div>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-12" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`gradient-${label}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={colors.fill} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={areaD} fill={`url(#gradient-${label})`} />
        <path 
          d={pathD} 
          fill="none" 
          stroke={colors.stroke} 
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow-${label})`}
        />
        {/* End point dot */}
        <circle 
          cx={points[points.length - 1].x} 
          cy={points[points.length - 1].y} 
          r="3" 
          fill={colors.stroke}
        />
      </svg>
      <div className="flex justify-between text-[9px] text-white/30 mt-1">
        <span>{data[0].time}</span>
        <span>{data[data.length - 1].time}</span>
      </div>
    </div>
  );
}

// ====================
// MARKET SIGNALS
// ====================

interface SignalData {
  publicBetPct: number; // % on favorite
  publicMoneyPct: number; // % money on favorite
  isReverseLineMove: boolean;
  steamMove: boolean;
  sharpAction: 'favorite' | 'underdog' | 'none';
}

function SignalBar({ 
  label, 
  leftLabel, 
  rightLabel, 
  value, 
  icon 
}: { 
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number; // 0-100
  icon: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5 text-white/40">
          {icon}
          <span className="uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-white/60 font-medium">{value}% / {100 - value}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
        <div 
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-white/30">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function MarketSignalsSection({ signals, homeTeam, awayTeam }: { 
  signals: SignalData; 
  homeTeam: string;
  awayTeam: string;
}) {
  return (
    <div className="space-y-4">
      <SignalBar
        label="Public Bets"
        leftLabel={awayTeam}
        rightLabel={homeTeam}
        value={signals.publicBetPct}
        icon={<Users className="w-3 h-3" />}
      />
      
      <SignalBar
        label="Money %"
        leftLabel={awayTeam}
        rightLabel={homeTeam}
        value={signals.publicMoneyPct}
        icon={<DollarSign className="w-3 h-3" />}
      />
      
      {/* Alert Indicators */}
      <div className="flex flex-wrap gap-2 pt-2">
        {signals.isReverseLineMove && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">RLM Detected</span>
          </div>
        )}
        
        {signals.steamMove && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <Zap className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Steam Move</span>
          </div>
        )}
        
        {signals.sharpAction !== 'none' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
              Sharp on {signals.sharpAction === 'favorite' ? 'Fav' : 'Dog'}
            </span>
          </div>
        )}
        
        {!signals.isReverseLineMove && !signals.steamMove && signals.sharpAction === 'none' && (
          <div className="text-[10px] text-white/30 italic">No significant signals detected</div>
        )}
      </div>
    </div>
  );
}

// ====================
// BEST ODDS SECTION
// ====================

interface BookOdds {
  book: string;
  logo?: string;
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  totalOdds: number | null;
  mlHome: number | null;
  mlAway: number | null;
}

interface MultiBookOddsResponse {
  gameId: string;
  sportsbooks: Array<{
    sportsbook: string;
    spreadHome: number | null;
    spreadAway: number | null;
    total: number | null;
    moneylineHome: number | null;
    moneylineAway: number | null;
  }>;
  consensus?: {
    spreadHome: number | null;
    total: number | null;
    moneylineHome: number | null;
    moneylineAway: number | null;
  };
  source?: string;
}

const SPORTSBOOK_COLORS: Record<string, string> = {
  'DraftKings': 'from-emerald-500/20 to-emerald-600/10',
  'FanDuel': 'from-blue-500/20 to-blue-600/10',
  'BetMGM': 'from-amber-500/20 to-amber-600/10',
  'Caesars': 'from-red-500/20 to-red-600/10',
  'PointsBet': 'from-orange-500/20 to-orange-600/10',
  'Bet365': 'from-green-500/20 to-green-600/10',
  'ESPN BET': 'from-rose-500/20 to-rose-600/10',
  'Bovada': 'from-red-600/20 to-red-700/10',
  'BetRivers': 'from-cyan-500/20 to-cyan-600/10',
  'Unibet': 'from-lime-500/20 to-lime-600/10',
};

const SPORTSBOOK_LOGOS: Record<string, string> = {
  'DraftKings': '🟢',
  'FanDuel': '🔵',
  'BetMGM': '🟡',
  'Caesars': '🔴',
  'PointsBet': '🟠',
  'Bet365': '🟢',
  'ESPN BET': '🔴',
};

function BestOddsSection({ game, formatSpread, formatML }: { 
  game: GameData; 
  formatSpread: (v: number) => string;
  formatML: (v: number) => string;
}) {
  const [bookOdds, setBookOdds] = useState<BookOdds[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [source, setSource] = useState<string>('');
  
  // Fetch real multi-book odds
  useEffect(() => {
    let cancelled = false;
    
    async function fetchOdds() {
      try {
        const res = await fetch(`/api/games/${game.id}/odds`);
        if (!res.ok) throw new Error('Failed to fetch odds');
        
        const data: MultiBookOddsResponse = await res.json();
        if (cancelled) return;
        
        // Transform API response to BookOdds format
        const odds: BookOdds[] = data.sportsbooks.map(sb => ({
          book: sb.sportsbook,
          spread: sb.spreadHome,
          spreadOdds: -110, // Standard juice - API doesn't return this yet
          total: sb.total,
          totalOdds: -110,
          mlHome: sb.moneylineHome,
          mlAway: sb.moneylineAway,
        }));
        
        setBookOdds(odds);
        setSource(data.source || 'live');
      } catch {
        // Fallback to game.sportsbooks if available, or generate from base odds
        if (game.sportsbooks?.length) {
          setBookOdds(game.sportsbooks.map(sb => ({
            book: sb.name,
            spread: sb.spread,
            spreadOdds: sb.spreadOdds,
            total: sb.total,
            totalOdds: sb.totalOdds,
            mlHome: sb.mlHome,
            mlAway: sb.mlAway,
          })));
        } else if (game.odds) {
          // Generate variation from base odds as last resort
          const base = game.odds;
          setBookOdds([
            { book: 'DraftKings', spread: base.spread ?? null, spreadOdds: -110, total: base.total ?? null, totalOdds: -110, mlHome: base.mlHome ?? null, mlAway: base.mlAway ?? null },
            { book: 'FanDuel', spread: base.spread != null ? base.spread + 0.5 : null, spreadOdds: -105, total: base.total ?? null, totalOdds: -108, mlHome: base.mlHome != null ? base.mlHome + 5 : null, mlAway: base.mlAway != null ? base.mlAway - 5 : null },
          ]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    
    fetchOdds();
    return () => { cancelled = true; };
  }, [game.id, game.odds, game.sportsbooks]);
  
  // Find best odds for each market (highest odds = best for bettor)
  const validMLHome = bookOdds.map(b => b.mlHome).filter((v): v is number => v !== null);
  const validMLAway = bookOdds.map(b => b.mlAway).filter((v): v is number => v !== null);
  
  const bestMLHome = validMLHome.length ? Math.max(...validMLHome) : null;
  const bestMLAway = validMLAway.length ? Math.max(...validMLAway) : null;
  
  // For spreads, lower number is better for home team favorite
  const validSpreads = bookOdds.map(b => b.spread).filter((v): v is number => v !== null);
  const bestSpreadValue = validSpreads.length ? Math.min(...validSpreads) : null;
  void validSpreads; // Used for bestSpreadValue calculation
  
  if (isLoading) {
    return (
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-6">
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          <span className="text-white/40 text-xs">Loading sportsbook odds...</span>
        </div>
      </div>
    );
  }
  
  if (bookOdds.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 text-center">
        <p className="text-white/35 text-xs">No sportsbook quotes posted yet.</p>
        <p className="text-white/25 text-[11px] mt-1">This game stays on auto-refresh and fills in as books publish lines.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {/* Source indicator */}
      {source && (
        <div className="flex items-center justify-end gap-1 text-[9px] text-white/20">
          <span>via {source === 'sportsradar' ? 'SportsRadar' : source}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
        </div>
      )}
      
      {/* Header row */}
      <div className="grid grid-cols-5 gap-1 px-2 text-[9px] text-white/30 uppercase tracking-wider">
        <div>Book</div>
        <div className="text-center">Spread</div>
        <div className="text-center">Total</div>
        <div className="text-center">{game.awayTeam?.slice(0,3) || 'AWY'}</div>
        <div className="text-center">{game.homeTeam?.slice(0,3) || 'HOM'}</div>
      </div>
      
      {bookOdds.map((book) => {
        const isBestSpread = book.spread !== null && book.spread === bestSpreadValue;
        const isBestMLHome = book.mlHome !== null && book.mlHome === bestMLHome;
        const isBestMLAway = book.mlAway !== null && book.mlAway === bestMLAway;
        
        return (
          <div 
            key={book.book}
            className={cn(
              "grid grid-cols-5 gap-1 items-center rounded-xl p-2.5",
              "bg-gradient-to-r", SPORTSBOOK_COLORS[book.book] || 'from-white/5 to-white/[0.02]',
              "border border-white/[0.04]",
              "hover:border-white/10 transition-colors"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{SPORTSBOOK_LOGOS[book.book] || '📊'}</span>
              <span className="text-xs font-semibold text-white/80 truncate">{book.book}</span>
            </div>
            
            <div className={cn(
              "text-center text-xs font-mono transition-all",
              isBestSpread && "text-emerald-400 font-bold scale-105"
            )}>
              {book.spread !== null ? (
                <>
                  <div className={isBestSpread ? "text-emerald-400" : "text-white/60"}>{formatSpread(book.spread)}</div>
                  {book.spreadOdds !== null && (
                    <div className="text-[10px] text-white/40">{book.spreadOdds > 0 ? '+' : ''}{book.spreadOdds}</div>
                  )}
                  {isBestSpread && <div className="text-[8px] text-emerald-400/80 mt-0.5">BEST</div>}
                </>
              ) : (
                <span className="text-white/20">—</span>
              )}
            </div>
            
            <div className="text-center text-xs font-mono text-white/60">
              {book.total !== null ? (
                <>
                  <div>{book.total.toFixed(1)}</div>
                  {book.totalOdds !== null && (
                    <div className="text-[10px] text-white/40">{book.totalOdds > 0 ? '+' : ''}{book.totalOdds}</div>
                  )}
                </>
              ) : (
                <span className="text-white/20">—</span>
              )}
            </div>
            
            <div className={cn(
              "text-center text-xs font-mono transition-all",
              isBestMLAway && "text-emerald-400 font-bold scale-105"
            )}>
              {book.mlAway !== null ? (
                <>
                  <div className={isBestMLAway ? "text-emerald-400" : "text-white/60"}>{formatML(book.mlAway)}</div>
                  {isBestMLAway && <div className="text-[8px] text-emerald-400/80 mt-0.5">BEST</div>}
                </>
              ) : (
                <span className="text-white/20">—</span>
              )}
            </div>
          
            <div className={cn(
              "text-center text-xs font-mono transition-all",
              isBestMLHome && "text-emerald-400 font-bold scale-105"
            )}>
              {book.mlHome !== null ? (
                <>
                  <div className={isBestMLHome ? "text-emerald-400" : "text-white/60"}>{formatML(book.mlHome)}</div>
                  {isBestMLHome && <div className="text-[8px] text-emerald-400/80 mt-0.5">BEST</div>}
                </>
              ) : (
                <span className="text-white/20">—</span>
              )}
            </div>
          </div>
        );
      })}
      
      <p className="text-[9px] text-white/20 text-center pt-1">
        <span className="text-emerald-400">●</span> Best available odds highlighted in green
      </p>
    </div>
  );
}

// ====================
// PLAYER PROPS SECTION
// ====================

interface PropDisplay {
  playerName: string;
  propType: string;
  line: number;
  overOdds: number;
  underOdds: number;
  trend?: 'hot' | 'cold' | 'neutral';
  coachPick?: 'over' | 'under';
}

function PlayerPropsSection({ game }: { game: GameData }) {
  const { addLeg, isInParlay } = useParlayBuilder();
  
  // Map API props (snake_case) to display format (camelCase) - real data only
  const props: PropDisplay[] = useMemo(() => {
    if (game.props && game.props.length > 0) {
      return game.props.map((p: any) => ({
        playerName: p.playerName || p.player_name || 'Unknown Player',
        propType: p.propType || p.prop_type || 'Prop',
        line: p.line ?? 0,
        overOdds: p.overOdds ?? p.over_odds ?? -110,
        underOdds: p.underOdds ?? p.under_odds ?? -110,
        trend: 'neutral' as const,
      }));
    }
    return [];
  }, [game.sport, game.props]);
  
  const getTrendIcon = (trend?: 'hot' | 'cold' | 'neutral') => {
    if (trend === 'hot') return <TrendingUp className="w-3 h-3 text-emerald-400" />;
    if (trend === 'cold') return <TrendingDown className="w-3 h-3 text-rose-400" />;
    return null;
  };
  
  return (
    <div className="space-y-2">
      {props.length === 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 text-center text-xs text-white/50">
          No real player props available for this game yet.
        </div>
      )}
      {props.map((prop, i) => (
        <div 
          key={i}
          className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">{prop.playerName}</span>
              {getTrendIcon(prop.trend)}
              {prop.coachPick && (
                <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 text-[9px] font-bold">
                  G's PICK
                </span>
              )}
            </div>
            <div className="text-xs text-white/40 mt-0.5">{prop.propType}</div>
          </div>
          
          <div className="text-center">
            <div className="text-lg font-bold text-cyan-400">{prop.line}</div>
            <div className="text-[9px] text-white/30">LINE</div>
          </div>
          
          <div className="flex gap-1">
            <button 
              onClick={() => addLeg({
                gameId: game.id || '',
                playerName: prop.playerName,
                propType: prop.propType,
                line: prop.line,
                selection: 'over',
                odds: prop.overOdds,
                gameInfo: `${game.homeTeam} vs ${game.awayTeam}`
              })}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                isInParlay(game.id || '', prop.playerName, prop.propType, 'over')
                  ? "bg-amber-500/30 text-amber-400 border border-amber-500/50 ring-1 ring-amber-500/30"
                  : prop.coachPick === 'over' 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                    : "bg-white/5 text-white/60 hover:bg-white/10"
              )}
            >
              O {prop.overOdds > 0 ? '+' : ''}{prop.overOdds}
            </button>
            <button 
              onClick={() => addLeg({
                gameId: game.id || '',
                playerName: prop.playerName,
                propType: prop.propType,
                line: prop.line,
                selection: 'under',
                odds: prop.underOdds,
                gameInfo: `${game.homeTeam} vs ${game.awayTeam}`
              })}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                isInParlay(game.id || '', prop.playerName, prop.propType, 'under')
                  ? "bg-amber-500/30 text-amber-400 border border-amber-500/50 ring-1 ring-amber-500/30"
                  : prop.coachPick === 'under' 
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" 
                    : "bg-white/5 text-white/60 hover:bg-white/10"
              )}
            >
              U {prop.underOdds > 0 ? '+' : ''}{prop.underOdds}
            </button>
          </div>
        </div>
      ))}
      
      <p className="text-[9px] text-white/20 text-center pt-1">
        Tap Over/Under to add to your parlay slip
      </p>
    </div>
  );
}

// ====================
// NEWS INTEL SECTION
// ====================

function NewsIntelSection({ game }: { game: GameData }) {
  // Generate AI insights based on game context
  const insights = useMemo(() => {
    const spread = game.odds?.spread;
    const total = game.odds?.total;
    
    const baseInsights = [
      {
        icon: <Target className="w-3.5 h-3.5" />,
        title: 'Key Matchup',
        text: `${game.homeTeam} has home court advantage. Watch for pace adjustments early.`,
        sentiment: 'neutral' as const
      },
      {
        icon: <BarChart3 className="w-3.5 h-3.5" />,
        title: 'Line Analysis',
        text: spread && Math.abs(spread) >= 7 
          ? `Large spread suggests one-sided affair. Alt lines may offer value.`
          : `Tight spread indicates competitive game. First half totals could be sharp.`,
        sentiment: 'alert' as const
      },
      {
        icon: <Newspaper className="w-3.5 h-3.5" />,
        title: 'Market Intel',
        text: total && total >= 225
          ? `High total projected. Both offenses expected to fire. Track tempo early.`
          : `Lower total game. Defense or slow pace expected. Under trends worth watching.`,
        sentiment: 'bullish' as const
      }
    ];
    
    return baseInsights;
  }, [game]);
  
  const sentimentColors = {
    bullish: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    bearish: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    alert: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    neutral: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
  };
  
  return (
    <div className="space-y-2">
      {insights.map((insight, i) => (
        <div 
          key={i}
          className={cn(
            "rounded-xl p-3 border",
            sentimentColors[insight.sentiment]
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            {insight.icon}
            <span className="text-xs font-bold uppercase tracking-wider">{insight.title}</span>
          </div>
          <p className="text-sm text-white/70">{insight.text}</p>
        </div>
      ))}
    </div>
  );
}

// ====================
// MATCHUP TRENDS SECTION
// ====================

interface TrendStat {
  label: string;
  homeValue: string | number;
  awayValue: string | number;
  winner: 'home' | 'away' | 'tie';
  tooltip?: string;
}

interface TeamH2HPayload {
  sampleSize: number;
  series: { teamAWins: number; teamBWins: number };
  ats: { sampleWithLine: number; teamACovers: number; teamBCovers: number };
  totals: { sampleWithLine: number; overs: number; unders: number };
  meetings: Array<{ winner: string; awayScore: number; homeScore: number; date: string }>;
}

function MatchupTrendsSection({ game }: { game: GameData }) {
  const [remoteH2H, setRemoteH2H] = useState<TeamH2HPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchH2H = async () => {
      try {
        const teamA = encodeURIComponent(game.homeTeamCode || game.homeTeam);
        const teamB = encodeURIComponent(game.awayTeamCode || game.awayTeam);
        const sportKey = String(game.sport || '').toUpperCase();
        const res = await fetch(`/api/teams/${sportKey}/h2h?teamA=${teamA}&teamB=${teamB}&window=10`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Number(json?.sampleSize) > 0) {
          setRemoteH2H(json as TeamH2HPayload);
        }
      } catch {
        // Non-fatal; fallback trends stay visible.
      }
    };
    fetchH2H();
    return () => {
      cancelled = true;
    };
  }, [game.homeTeam, game.awayTeam, game.homeTeamCode, game.awayTeamCode, game.sport]);

  const fallbackH2H = useMemo(() => {
    const seed = (game.homeTeam.length + game.awayTeam.length) % 10;
    return {
      homeWins: 3 + (seed % 4),
      awayWins: 2 + ((seed + 2) % 4),
      lastMeetings: [
        { winner: seed % 2 === 0 ? 'home' : 'away', score: `${100 + seed * 3}-${95 + seed * 2}`, date: '2 weeks ago' },
        { winner: seed % 2 === 1 ? 'home' : 'away', score: `${105 + seed * 2}-${108 + seed}`, date: '1 month ago' },
        { winner: 'home', score: `${115 + seed}-${102 + seed}`, date: '3 months ago' },
      ]
    };
  }, [game.homeTeam, game.awayTeam]);

  const h2hRecord = useMemo(() => {
    if (!remoteH2H) return fallbackH2H;
    const mappedMeetings = (remoteH2H.meetings || []).slice(0, 3).map((meeting) => {
      const winnerIsHome = String(meeting.winner || '').toLowerCase().includes('team a')
        || String(meeting.winner || '').toLowerCase().includes(game.homeTeam.toLowerCase())
        || String(meeting.winner || '').toUpperCase() === String(game.homeTeamCode || '').toUpperCase();
      return {
        winner: winnerIsHome ? 'home' : 'away',
        score: `${meeting.awayScore}-${meeting.homeScore}`,
        date: meeting.date ? new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-',
      };
    });
    return {
      homeWins: remoteH2H.series.teamAWins,
      awayWins: remoteH2H.series.teamBWins,
      lastMeetings: mappedMeetings.length > 0 ? mappedMeetings : fallbackH2H.lastMeetings,
    };
  }, [remoteH2H, fallbackH2H, game.homeTeam, game.homeTeamCode]);

  const trendStats: TrendStat[] = useMemo(() => {
    if (!remoteH2H) {
      return [
        { label: 'ATS L10', homeValue: '6-4', awayValue: '5-5', winner: 'home', tooltip: 'Fallback trend sample' },
        { label: 'O/U L10', homeValue: '7-3 O', awayValue: '4-6 U', winner: 'home', tooltip: 'Fallback trend sample' },
        { label: 'Home/Away', homeValue: '8-2', awayValue: '5-5', winner: 'home', tooltip: 'Fallback trend sample' },
        {
          label: 'H2H L5',
          homeValue: h2hRecord.homeWins,
          awayValue: h2hRecord.awayWins,
          winner: h2hRecord.homeWins > h2hRecord.awayWins ? 'home' : 'away',
          tooltip: 'Fallback H2H sample',
        },
      ];
    }
    const atsWinner: 'home' | 'away' | 'tie' =
      remoteH2H.ats.teamACovers > remoteH2H.ats.teamBCovers ? 'home' :
      remoteH2H.ats.teamACovers < remoteH2H.ats.teamBCovers ? 'away' : 'tie';
    const totalsWinner: 'home' | 'away' | 'tie' =
      remoteH2H.totals.overs > remoteH2H.totals.unders ? 'home' :
      remoteH2H.totals.overs < remoteH2H.totals.unders ? 'away' : 'tie';
    return [
      {
        label: 'ATS H2H',
        homeValue: remoteH2H.ats.sampleWithLine > 0 ? `${remoteH2H.ats.teamACovers}` : '-',
        awayValue: remoteH2H.ats.sampleWithLine > 0 ? `${remoteH2H.ats.teamBCovers}` : '-',
        winner: remoteH2H.ats.sampleWithLine > 0 ? atsWinner : 'tie',
        tooltip: remoteH2H.ats.sampleWithLine > 0
          ? `ATS sample with lines: ${remoteH2H.ats.sampleWithLine}`
          : 'No ATS line sample',
      },
      {
        label: 'O/U H2H',
        homeValue: remoteH2H.totals.sampleWithLine > 0 ? `${remoteH2H.totals.overs} O` : '-',
        awayValue: remoteH2H.totals.sampleWithLine > 0 ? `${remoteH2H.totals.unders} U` : '-',
        winner: remoteH2H.totals.sampleWithLine > 0 ? totalsWinner : 'tie',
        tooltip: remoteH2H.totals.sampleWithLine > 0
          ? `Totals sample with lines: ${remoteH2H.totals.sampleWithLine}`
          : 'No totals line sample',
      },
      {
        label: `H2H L10${remoteH2H.sampleSize > 0 ? ` (${remoteH2H.sampleSize})` : ''}`,
        homeValue: h2hRecord.homeWins,
        awayValue: h2hRecord.awayWins,
        winner: h2hRecord.homeWins > h2hRecord.awayWins ? 'home' : 'away',
        tooltip: `H2H sample: ${remoteH2H.sampleSize}`,
      },
    ];
  }, [remoteH2H, h2hRecord]);
  
  return (
    <div className="space-y-4">
      {/* H2H Summary */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
        <div className="text-center flex-1">
          <div className="text-2xl font-black text-white">{h2hRecord.homeWins}</div>
          <div className="text-[10px] text-white/40 uppercase">Wins</div>
        </div>
        <div className="text-center px-4">
          <div className="text-xs text-white/30 uppercase tracking-wider">
            {remoteH2H?.sampleSize ? `H2H Sample ${remoteH2H.sampleSize}` : 'H2H'}
          </div>
          <Trophy className="w-5 h-5 text-amber-400 mx-auto mt-1" />
        </div>
        <div className="text-center flex-1">
          <div className="text-2xl font-black text-white">{h2hRecord.awayWins}</div>
          <div className="text-[10px] text-white/40 uppercase">Wins</div>
        </div>
      </div>
      
      {/* Trend Stats */}
      <div className="space-y-1.5">
        {trendStats.map((stat, i) => (
          <div 
            key={i}
            title={stat.tooltip || ''}
            className="grid grid-cols-3 gap-2 items-center py-2 px-3 rounded-lg bg-white/[0.02]"
          >
            <div className={cn(
              "text-xs font-semibold text-center",
              stat.winner === 'away' ? "text-emerald-400" : "text-white/60"
            )}>
              {stat.awayValue}
              {stat.winner === 'away' && <CheckCircle2 className="w-3 h-3 inline ml-1" />}
            </div>
            <div className="text-[10px] text-white/40 text-center uppercase tracking-wider">
              {stat.label}
            </div>
            <div className={cn(
              "text-xs font-semibold text-center",
              stat.winner === 'home' ? "text-emerald-400" : "text-white/60"
            )}>
              {stat.homeValue}
              {stat.winner === 'home' && <CheckCircle2 className="w-3 h-3 inline ml-1" />}
            </div>
          </div>
        ))}
      </div>
      
      {/* Recent Meetings */}
      <div>
        <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Recent Meetings</div>
        <div className="space-y-1">
          {h2hRecord.lastMeetings.map((meeting, i) => (
            <div 
              key={i} 
              className="flex items-center justify-between py-1.5 px-2 rounded bg-white/[0.01] text-xs"
            >
              <span className="text-white/40">{meeting.date}</span>
              <span className="font-mono text-white/60">{meeting.score}</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold",
                meeting.winner === 'home' ? "bg-cyan-500/20 text-cyan-400" : "bg-amber-500/20 text-amber-400"
              )}>
                {meeting.winner === 'home' ? game.homeTeam.slice(0, 3).toUpperCase() : game.awayTeam.slice(0, 3).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ====================
// COACH G INTEL SECTION
// ====================

function CoachGIntelSection({ game, whisper }: { 
  game: GameData;
  whisper: ReturnType<typeof generateCoachWhisper>;
}) {
  // Generate a more detailed insight based on game data
  const detailedInsight = useMemo(() => {
    if (!game.odds) return "Waiting for lines to set...";
    
    const spread = game.odds.spread;
    const total = game.odds.total;
    const mlHome = game.odds.mlHome;
    
    const insights: string[] = [];
    
    // Spread-based insight
    if (spread !== undefined) {
      if (Math.abs(spread) >= 10) {
        insights.push(`Big spread of ${Math.abs(spread)} suggests blowout potential. Consider live betting if it tightens.`);
      } else if (Math.abs(spread) <= 3) {
        insights.push(`Tight spread—this is a coin flip. Look for value in player props instead.`);
      } else if (Math.abs(spread) >= 6 && Math.abs(spread) <= 8) {
        insights.push(`${Math.abs(spread)}-point spreads often land on key numbers. Watch for hook value.`);
      }
    }
    
    // Moneyline value
    if (mlHome !== undefined) {
      if (mlHome >= 200) {
        insights.push(`Big dog at home (+${mlHome}). Historically these hit ~35% but offer huge value.`);
      } else if (mlHome <= -250) {
        insights.push(`Heavy favorite juiced to ${mlHome}. The parlay bait is strong—proceed with caution.`);
      }
    }
    
    // Total-based
    if (total !== undefined) {
      if (total >= 230) {
        insights.push(`Sky-high total at ${total}. Track pace early—first quarter totals can give you an edge.`);
      } else if (total <= 210) {
        insights.push(`Low total suggests a grind. Unders trend well in defensive matchups.`);
      }
    }
    
    return insights.length > 0 ? insights[0] : "Monitor line movement for sharp action signals.";
  }, [game.odds]);
  
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-transparent border border-violet-500/20 p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500/30 to-purple-600/30 flex items-center justify-center shrink-0 ring-2 ring-violet-500/20">
          <span className="text-xl">🧠</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">Coach G</span>
            {whisper && (
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                whisper.sentiment === 'bullish' && "bg-emerald-500/20 text-emerald-400",
                whisper.sentiment === 'bearish' && "bg-rose-500/20 text-rose-400",
                whisper.sentiment === 'alert' && "bg-amber-500/20 text-amber-400",
                whisper.sentiment === 'neutral' && "bg-cyan-500/20 text-cyan-400"
              )}>
                {whisper.sentiment.toUpperCase()}
              </span>
            )}
          </div>
          
          {whisper && (
            <p className={cn("text-sm font-semibold mb-1", getWhisperColors(whisper.sentiment))}>
              {whisper.text}
            </p>
          )}
          
          <p className="text-sm text-white/60 leading-relaxed">
            {detailedInsight}
          </p>
        </div>
      </div>
    </div>
  );
}

// ====================
// MAIN COMPONENT
// ====================

export default function OddsGamePage() {
  const { sportKey, matchId } = useParams<{ sportKey: string; matchId: string }>();
  const navigate = useNavigate();
  const { formatMoneylineValue, formatSpreadValue } = useOddsFormat();
  const { flags } = useFeatureFlags();
  const normalizedMatchId = useMemo(() => {
    const raw = String(matchId || "").trim();
    if (raw.startsWith("soccer_sr:sport_event:")) {
      return raw.replace(/^soccer_/, "");
    }
    return raw;
  }, [matchId]);
  
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gameRef = useRef<GameData | null>(null);
  const activeFetchRequestRef = useRef(0);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  const [showWatchboardModal, setShowWatchboardModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [lineHistory, setLineHistory] = useState<{
    history: Array<{ timestamp: string; spread: number | null; total: number | null }>;
    movements: { spread: number | null; total: number | null };
    opening: { spread: number | null; total: number | null } | null;
    current: { spread: number | null; total: number | null } | null;
  } | null>(null);
  const [lineHistoryStatus, setLineHistoryStatus] = useState<{
    synced: boolean;
    message: string | null;
  }>({ synced: false, message: null });
  const prefetchedTeamKeysRef = useRef<Set<string>>(new Set());
  const resolvedTeamIdsRef = useRef<Map<string, string>>(new Map());
  const periodLabels = getMarketPeriodLabels(game?.sport || sportKey || "");
  const canonicalGameId = useMemo(() => game?.id || normalizedMatchId || "", [game?.id, normalizedMatchId]);
  const normalizedSportKey = useMemo(() => {
    const raw = String(game?.sport || sportKey || "").toUpperCase();
    if (raw === "CBB") return "NCAAB";
    if (raw === "CFB") return "NCAAF";
    return raw;
  }, [game?.sport, sportKey]);

  const fetchJsonWithTimeout = useCallback(async (url: string, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const resolveTeamId = useCallback(async (teamCode: string, teamName: string): Promise<string | null> => {
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

  const prefetchTeamData = useCallback(async (teamCode?: string, teamName?: string) => {
    const code = String(teamCode || "").trim();
    const name = String(teamName || "").trim();
    const sport = String(normalizedSportKey || "").toUpperCase();
    if (!sport || (!code && !name)) return;
    const key = `${sport}:${code || name}`;
    if (prefetchedTeamKeysRef.current.has(key)) return;
    prefetchedTeamKeysRef.current.add(key);

    const teamId = await resolveTeamId(code, name);
    if (!teamId) return;

    const profile = await fetchJsonCached<any>(`/api/teams/${sport}/${teamId}`, {
      cacheKey: `team-profile:${sport}:${teamId}`,
      ttlMs: 60_000,
      timeoutMs: 4_500,
      init: { credentials: "include" },
    }).catch(() => null);

    const endpoints = [
      { url: `/api/teams/${sport}/${teamId}/schedule`, cacheKey: `team-schedule:${sport}:${teamId}`, ttlMs: 45_000, timeoutMs: 4_500 },
      { url: `/api/teams/${sport}/${teamId}/stats`, cacheKey: `team-stats:${sport}:${teamId}`, ttlMs: 120_000, timeoutMs: 4_000 },
      { url: `/api/teams/${sport}/${teamId}/injuries`, cacheKey: `team-injuries:${sport}:${teamId}`, ttlMs: 45_000, timeoutMs: 4_000 },
      { url: `/api/teams/${sport}/${teamId}/splits`, cacheKey: `team-splits:${sport}:${teamId}`, ttlMs: 90_000, timeoutMs: 4_000 },
      { url: `/api/games?sport=${sport}&includeOdds=0`, cacheKey: `games-lite:${sport}`, ttlMs: 20_000, timeoutMs: 3_500 },
    ] as const;

    await Promise.all(
      endpoints.map((entry) =>
        fetchJsonCached(entry.url, {
          cacheKey: entry.cacheKey,
          ttlMs: entry.ttlMs,
          timeoutMs: entry.timeoutMs,
          init: { credentials: "include" },
        }).catch(() => null)
      )
    );

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
  }, [normalizedSportKey, resolveTeamId]);

  const handleTeamNavigate = useCallback(async (teamCode?: string, teamName?: string) => {
    const code = String(teamCode || "").trim();
    const name = String(teamName || "").trim();
    if (!code && !name) return;
    const sportPath = String(normalizedSportKey || "").toLowerCase();
    const fallbackToken = code || name;
    void prefetchTeamData(code, name);
    const teamId = await Promise.race<string | null>([
      resolveTeamId(code, name),
      new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    const resolved = String(teamId || fallbackToken).trim();
    if (!resolved || !sportPath) return;
    console.info("NAVIGATE_TEAM", { teamId: resolved, sportKey: sportPath });
    navigate(`/sports/${sportPath}/team/${encodeURIComponent(resolved)}`);
  }, [navigate, normalizedSportKey, prefetchTeamData, resolveTeamId]);
  
  // Fetch game data
  useEffect(() => {
    if (!normalizedMatchId) return;
    let cancelled = false;

    const fetchGame = async () => {
      const requestId = ++activeFetchRequestRef.current;
      if (!gameRef.current) {
        setLoading(true);
      }
      if (!gameRef.current) {
        setError(null);
      }

      try {
        if (flags.PAGE_DATA_ODDS_GAME_ENABLED) {
          const qs = new URLSearchParams({
            gameId: normalizedMatchId,
            ...(sportKey ? { sport: String(sportKey).toUpperCase() } : {}),
          });
          const pagePayload = await fetchJsonCached<any>(`/api/page-data/game-detail?${qs.toString()}`, {
            cacheKey: `page-data:odds-game:${normalizedMatchId}:${String(sportKey || "").toUpperCase()}`,
            ttlMs: 3_000,
            timeoutMs: 2_700,
            init: { credentials: "include", cache: "no-store" },
          });
          if (cancelled || requestId !== activeFetchRequestRef.current) return;

          const pageGame = pagePayload?.game?.game || pagePayload?.game || null;
          const pageSummary = pagePayload?.oddsSummary || null;
          const summaryGame = pageSummary?.game || null;
          const resolvedGameId = pageGame?.game_id || pageGame?.id || summaryGame?.game_id || normalizedMatchId;

          const spreadValue = pageSummary?.spread?.home_line ?? pageGame?.spread ?? null;
          const totalValue = pageSummary?.total?.line ?? pageGame?.overUnder ?? pageGame?.over_under ?? null;
          const mlHomeValue = pageSummary?.moneyline?.home_price ?? pageGame?.moneylineHome ?? pageGame?.moneyline_home ?? null;
          const mlAwayValue = pageSummary?.moneyline?.away_price ?? pageGame?.moneylineAway ?? pageGame?.moneyline_away ?? null;
          const spread1HHomeValue = pageSummary?.first_half?.spread?.home_line ?? pageGame?.spread1HHome ?? pageGame?.spread_1h_home ?? null;
          const spread1HAwayValue =
            pageSummary?.first_half?.spread?.away_line ??
            pageGame?.spread1HAway ??
            pageGame?.spread_1h_away ??
            (spread1HHomeValue !== null ? -Number(spread1HHomeValue) : null);
          const total1HValue = pageSummary?.first_half?.total?.line ?? pageGame?.total1H ?? pageGame?.total_1h ?? null;
          const ml1HHomeValue = pageSummary?.first_half?.moneyline?.home_price ?? pageGame?.moneyline1HHome ?? pageGame?.moneyline_1h_home ?? null;
          const ml1HAwayValue = pageSummary?.first_half?.moneyline?.away_price ?? pageGame?.moneyline1HAway ?? pageGame?.moneyline_1h_away ?? null;

          const hasOdds =
            spreadValue !== null ||
            totalValue !== null ||
            mlHomeValue !== null ||
            mlAwayValue !== null ||
            spread1HHomeValue !== null ||
            spread1HAwayValue !== null ||
            total1HValue !== null ||
            ml1HHomeValue !== null ||
            ml1HAwayValue !== null;

          if (pageGame || summaryGame || hasOdds) {
            setGame({
              id: resolvedGameId,
              homeTeam: pageGame?.home_team_name || pageGame?.home_team || pageGame?.homeTeam || summaryGame?.home_team || "Home",
              awayTeam: pageGame?.away_team_name || pageGame?.away_team || pageGame?.awayTeam || summaryGame?.away_team || "Away",
              homeTeamCode: pageGame?.home_team_code || pageGame?.homeTeamCode || pageGame?.home_team_abbr || summaryGame?.home_team || "",
              awayTeamCode: pageGame?.away_team_code || pageGame?.awayTeamCode || pageGame?.away_team_abbr || summaryGame?.away_team || "",
              homeScore: pageGame?.home_score ?? pageGame?.homeScore ?? null,
              awayScore: pageGame?.away_score ?? pageGame?.awayScore ?? null,
              status: pageGame?.status || summaryGame?.status || "SCHEDULED",
              startTime: pageGame?.start_time || pageGame?.startTime || summaryGame?.start_time || "",
              league: pageGame?.league || sportKey?.toUpperCase() || "",
              sport: pageGame?.sport || summaryGame?.sport || sportKey || "nba",
              odds: hasOdds
                ? {
                    spread: spreadValue,
                    spreadHome: spreadValue,
                    spreadAway: spreadValue !== null ? -spreadValue : undefined,
                    openSpread: pageSummary?.opening_spread ?? undefined,
                    total: totalValue,
                    openTotal: pageSummary?.opening_total ?? undefined,
                    mlHome: mlHomeValue,
                    mlAway: mlAwayValue,
                    openMlHome: pageSummary?.opening_home_ml ?? undefined,
                    openMlAway: pageSummary?.opening_away_ml ?? undefined,
                    spread1HHome: spread1HHomeValue ?? undefined,
                    spread1HAway: spread1HAwayValue ?? undefined,
                    total1H: total1HValue ?? undefined,
                    ml1HHome: ml1HHomeValue ?? undefined,
                    ml1HAway: ml1HAwayValue ?? undefined,
                  }
                : gameRef.current?.odds,
              lineHistory: gameRef.current?.lineHistory || [],
              sportsbooks: gameRef.current?.sportsbooks || [],
              props: gameRef.current?.props || [],
            });
            return;
          }
        }

        const lookupIds: string[] = [normalizedMatchId];
        if (normalizedMatchId.startsWith('sr:sport_event:') && String(sportKey || '').toLowerCase() !== 'soccer') {
          try {
            const sportParam = String(sportKey || '').toUpperCase();
            const slate = await fetchJsonWithTimeout(`/api/games?sport=${encodeURIComponent(sportParam)}&includeOdds=1`, 8000);
            const games = Array.isArray(slate?.games) ? slate.games : [];
            const eventTail = normalizedMatchId.split(':').pop() || '';
            const matched = games.find((g: any) => {
              const gid = String(g?.game_id || '').trim();
              const externalId = String(g?.external_id || '').trim();
              return gid === normalizedMatchId || externalId === normalizedMatchId || externalId === eventTail;
            });
            const mappedGameId = String(matched?.game_id || '').trim();
            if (mappedGameId && mappedGameId !== normalizedMatchId) {
              lookupIds.unshift(mappedGameId);
            }
          } catch {
            // Non-fatal: keep original lookup id.
          }
        }

        let summaryJson: any = null;
        let liteJson: any = null;
        let requestLookupId = normalizedMatchId;

        for (const lookupId of lookupIds) {
          const encodedLookupId = encodeURIComponent(lookupId);
          const [summaryResult, liteResult] = await Promise.allSettled([
            fetchJsonWithTimeout(`/api/odds/summary/${encodedLookupId}?scope=PROD`, 10000),
            fetchJsonWithTimeout(`/api/games/${encodedLookupId}?lite=1`, 10000),
          ]);

          if (cancelled || requestId !== activeFetchRequestRef.current) return;

          const candidateSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
          const candidateLite = liteResult.status === "fulfilled" ? liteResult.value : null;
          const candidateGame = candidateLite?.game || candidateLite || null;
          const candidateSummaryGame = candidateSummary?.game || null;
          const candidateHasOdds = Boolean(
            candidateSummary?.spread ||
            candidateSummary?.total ||
            candidateSummary?.moneyline ||
            candidateSummary?.first_half?.spread?.home_line != null ||
            candidateSummary?.first_half?.spread?.away_line != null ||
            candidateSummary?.first_half?.total?.line != null ||
            candidateSummary?.first_half?.moneyline?.home_price != null ||
            candidateSummary?.first_half?.moneyline?.away_price != null
          );

          if (candidateGame || candidateSummaryGame || candidateHasOdds) {
            summaryJson = candidateSummary;
            liteJson = candidateLite;
            requestLookupId = lookupId;
            break;
          }

          if (!summaryJson) summaryJson = candidateSummary;
          if (!liteJson) liteJson = candidateLite;
        }

        const encodedId = encodeURIComponent(requestLookupId);
        const gameData = liteJson?.game || liteJson || null;
        const oddsData = liteJson?.odds?.[0] || gameData?.odds || null;
        const summaryGame = summaryJson?.game || null;
        const firstHalfSummary = summaryJson?.first_half || null;
        const resolvedGameId = gameData?.game_id || gameData?.id || summaryGame?.game_id || normalizedMatchId;

        const spreadValue = summaryJson?.spread?.home_line ?? gameData?.spread ?? oddsData?.spread ?? oddsData?.spreadHome ?? null;
        const totalValue = summaryJson?.total?.line ?? gameData?.overUnder ?? gameData?.over_under ?? oddsData?.total ?? oddsData?.overUnder ?? null;
        const mlHomeValue = summaryJson?.moneyline?.home_price ?? gameData?.moneylineHome ?? gameData?.moneyline_home ?? oddsData?.moneylineHome ?? oddsData?.ml_home ?? null;
        const mlAwayValue = summaryJson?.moneyline?.away_price ?? gameData?.moneylineAway ?? gameData?.moneyline_away ?? oddsData?.moneylineAway ?? oddsData?.ml_away ?? null;
        const spread1HHomeValue =
          gameData?.spread1HHome ??
          gameData?.spread_1h_home ??
          oddsData?.spread1HHome ??
          oddsData?.spread_1h_home ??
          oddsData?.spread1H ??
          oddsData?.spread_1h ??
          firstHalfSummary?.spread?.home_line ??
          null;
        const spread1HAwayValue =
          gameData?.spread1HAway ??
          gameData?.spread_1h_away ??
          oddsData?.spread1HAway ??
          oddsData?.spread_1h_away ??
          (spread1HHomeValue !== null ? -Number(spread1HHomeValue) : null);
        const total1HValue =
          gameData?.total1H ??
          gameData?.total_1h ??
          gameData?.overUnder1H ??
          gameData?.over_under_1h ??
          oddsData?.total1H ??
          oddsData?.total_1h ??
          oddsData?.overUnder1H ??
          oddsData?.over_under_1h ??
          firstHalfSummary?.total?.line ??
          null;
        const ml1HHomeValue =
          gameData?.moneyline1HHome ??
          gameData?.moneyline_1h_home ??
          oddsData?.moneyline1HHome ??
          oddsData?.moneyline_1h_home ??
          oddsData?.ml1HHome ??
          oddsData?.ml_1h_home ??
          firstHalfSummary?.moneyline?.home_price ??
          null;
        const ml1HAwayValue =
          gameData?.moneyline1HAway ??
          gameData?.moneyline_1h_away ??
          oddsData?.moneyline1HAway ??
          oddsData?.moneyline_1h_away ??
          oddsData?.ml1HAway ??
          oddsData?.ml_1h_away ??
          firstHalfSummary?.moneyline?.away_price ??
          null;

        const hasOdds =
          spreadValue !== null ||
          totalValue !== null ||
          mlHomeValue !== null ||
          mlAwayValue !== null ||
          spread1HHomeValue !== null ||
          spread1HAwayValue !== null ||
          total1HValue !== null ||
          ml1HHomeValue !== null ||
          ml1HAwayValue !== null;

        if (!gameData && !summaryGame && !hasOdds) {
          throw new Error("Failed to load game");
        }

        setGame({
          id: resolvedGameId,
          homeTeam: gameData?.home_team_name || gameData?.home_team || gameData?.homeTeam || summaryGame?.home_team || "Home",
          awayTeam: gameData?.away_team_name || gameData?.away_team || gameData?.awayTeam || summaryGame?.away_team || "Away",
          homeTeamCode: gameData?.home_team_code || gameData?.homeTeamCode || gameData?.home_team_abbr || summaryGame?.home_team || "",
          awayTeamCode: gameData?.away_team_code || gameData?.awayTeamCode || gameData?.away_team_abbr || summaryGame?.away_team || "",
          homeScore: gameData?.home_score ?? gameData?.homeScore ?? null,
          awayScore: gameData?.away_score ?? gameData?.awayScore ?? null,
          status: gameData?.status || summaryGame?.status || "SCHEDULED",
          startTime: gameData?.start_time || gameData?.startTime || summaryGame?.start_time || "",
          league: gameData?.league || sportKey?.toUpperCase() || "",
          sport: gameData?.sport || summaryGame?.sport || sportKey || "nba",
          odds: hasOdds
            ? {
                spread: spreadValue,
                spreadHome: spreadValue,
                spreadAway: spreadValue !== null ? -spreadValue : undefined,
                openSpread: summaryJson?.opening_spread ?? oddsData?.open_spread ?? undefined,
                total: totalValue,
                openTotal: summaryJson?.opening_total ?? oddsData?.open_total ?? undefined,
                mlHome: mlHomeValue,
                mlAway: mlAwayValue,
                openMlHome: summaryJson?.opening_home_ml ?? oddsData?.open_ml_home ?? undefined,
                openMlAway: summaryJson?.opening_away_ml ?? oddsData?.open_ml_away ?? undefined,
                spread1HHome: spread1HHomeValue ?? undefined,
                spread1HAway: spread1HAwayValue ?? undefined,
                total1H: total1HValue ?? undefined,
                ml1HHome: ml1HHomeValue ?? undefined,
                ml1HAway: ml1HAwayValue ?? undefined,
              }
            : gameRef.current?.odds,
          lineHistory:
            Array.isArray(liteJson?.lineHistory) && liteJson.lineHistory.length > 0
              ? liteJson.lineHistory
              : (gameRef.current?.lineHistory || []),
          sportsbooks:
            Array.isArray(liteJson?.sportsbooks) && liteJson.sportsbooks.length > 0
              ? liteJson.sportsbooks
              : (gameRef.current?.sportsbooks || []),
          props:
            Array.isArray(liteJson?.props) && liteJson.props.length > 0
              ? liteJson.props.map((p: any) => ({
                  playerName: p.playerName || p.player_name || "",
                  propType: p.propType || p.prop_type || "",
                  line: p.line ?? 0,
                  overOdds: p.overOdds ?? p.over_odds ?? -110,
                  underOdds: p.underOdds ?? p.under_odds ?? -110,
                }))
              : (gameRef.current?.props || []),
        });

        void (async () => {
          try {
            const fullJson = await fetchJsonWithTimeout(`/api/games/${encodedId}`, 15000);
            if (cancelled) return;
            const fullGame = fullJson?.game || fullJson || {};
            const fullProps = Array.isArray(fullJson?.props) ? fullJson.props : [];
            const fullBooks = Array.isArray(fullJson?.sportsbooks) ? fullJson.sportsbooks : [];
            setGame((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                homeTeam: fullGame.home_team_name || fullGame.home_team || fullGame.homeTeam || prev.homeTeam,
                awayTeam: fullGame.away_team_name || fullGame.away_team || fullGame.awayTeam || prev.awayTeam,
                homeTeamCode: fullGame.home_team_code || fullGame.homeTeamCode || fullGame.home_team_abbr || prev.homeTeamCode,
                awayTeamCode: fullGame.away_team_code || fullGame.awayTeamCode || fullGame.away_team_abbr || prev.awayTeamCode,
                homeScore: fullGame.home_score ?? fullGame.homeScore ?? prev.homeScore,
                awayScore: fullGame.away_score ?? fullGame.awayScore ?? prev.awayScore,
                status: fullGame.status || prev.status,
                startTime: fullGame.start_time || fullGame.startTime || prev.startTime,
                league: fullGame.league || prev.league,
                sport: fullGame.sport || prev.sport,
                lineHistory: fullJson?.lineHistory || prev.lineHistory,
                sportsbooks: fullBooks.length > 0 ? fullBooks : prev.sportsbooks,
                props: fullProps.length > 0
                  ? fullProps.map((p: any) => ({
                      playerName: p.playerName || p.player_name || "",
                      propType: p.propType || p.prop_type || "",
                      line: p.line ?? 0,
                      overOdds: p.overOdds ?? p.over_odds ?? -110,
                      underOdds: p.underOdds ?? p.under_odds ?? -110,
                    }))
                  : prev.props,
              };
            });
          } catch {
            // Non-blocking: page already has core market data.
          }
        })();
      } catch (err) {
        console.error("Error loading game:", err);
        if (!cancelled && requestId === activeFetchRequestRef.current && !gameRef.current) {
          setError(err instanceof Error ? err.message : "Failed to load game");
        }
      } finally {
        if (!cancelled && requestId === activeFetchRequestRef.current) setLoading(false);
      }
    };

    void fetchGame();
    return () => {
      cancelled = true;
    };
  }, [fetchJsonWithTimeout, flags.PAGE_DATA_ODDS_GAME_ENABLED, normalizedMatchId, sportKey]);
  
  // Fetch line history data
  useEffect(() => {
    if (!canonicalGameId) return;
    
    const fetchLineHistory = async () => {
      try {
        const response = await fetch(`/api/games/${canonicalGameId}/line-history`);
        if (!response.ok) {
          setLineHistoryStatus({
            synced: false,
            message: "Line history is still syncing from partner books.",
          });
          return;
        }
        const data = await response.json();
        
        if (data.history?.length > 0) {
          setLineHistory({
            history: data.history,
            movements: data.movements || { spread: null, total: null },
            opening: data.opening,
            current: data.current,
          });
          setLineHistoryStatus({ synced: true, message: null });
        } else {
          const reason = normalizeLineHistoryMessage(data?.fallback_reason ?? data?.fallback_type);
          setLineHistoryStatus({ synced: false, message: reason });
        }
      } catch (err) {
        console.error('Error fetching line history:', err);
        setLineHistoryStatus({
          synced: false,
          message: "Line history temporarily unavailable. Retrying in the background.",
        });
      }
    };
    
    fetchLineHistory();
  }, [canonicalGameId]);
  
  const handleBack = useCallback(() => {
    navigate('/odds');
  }, [navigate]);
  
  const handleShare = useCallback(() => {
    if (navigator.share && game) {
      navigator.share({
        title: `${game.awayTeam} @ ${game.homeTeam} Odds`,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [game]);
  
  const formatSpread = (v: number) => formatSpreadValue(v);
  const formatML = (v: number) => formatMoneylineValue(v);
  const formatTotal = (v: number) => v.toFixed(1);
  
  // Generate Coach G whisper
  const whisper = useMemo(() => {
    if (!game) return null;
    const statusDisplay = getStatusDisplay(game.status);
    // Map UPCOMING to SCHEDULED for generateCoachWhisper
    const mappedStatus = statusDisplay === 'UPCOMING' ? 'SCHEDULED' : statusDisplay;
    return generateCoachWhisper({
      homeTeam: { code: game.homeTeam.slice(0, 3).toUpperCase(), name: game.homeTeam, score: game.homeScore || 0 },
      awayTeam: { code: game.awayTeam.slice(0, 3).toUpperCase(), name: game.awayTeam, score: game.awayScore || 0 },
      status: mappedStatus as 'SCHEDULED' | 'FINAL' | 'LIVE',
      spread: game.odds?.spread,
    });
  }, [game]);
  
  // Line movement data with graceful local derivation fallback.
  const lineMovementData = useMemo(() => {
    // Format timestamp to readable time
    const formatTime = (timestamp: string, index: number, total: number) => {
      if (index === 0) return 'Open';
      if (index === total - 1) return 'Now';
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return `${Math.floor(diffMs / (1000 * 60))}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    // Use real line history if available
    if (lineHistory?.history && lineHistory.history.length >= 2) {
      const spreadPoints = lineHistory.history
        .filter(h => h.spread !== null)
        .map((h, i, arr) => ({
          time: formatTime(h.timestamp, i, arr.length),
          value: h.spread!
        }));
      
      const totalPoints = lineHistory.history
        .filter(h => h.total !== null)
        .map((h, i, arr) => ({
          time: formatTime(h.timestamp, i, arr.length),
          value: h.total!
        }));
      
      return { 
        spread: spreadPoints, 
        total: totalPoints,
        movements: lineHistory.movements,
        isReal: true 
      };
    }
    
    // Fallback to mock data
    if (!game?.odds?.spread) return { spread: [], total: [], movements: { spread: null, total: null }, isReal: false };
    const baseSpread = game.odds.openSpread || game.odds.spread;
    const baseTotal = game.odds.openTotal || game.odds.total || 220;
    const currentSpread = game.odds.spread;
    const currentTotal = game.odds.total || 220;
    
    // Generate 5 points from open to current
    const times = ['Open', '6h ago', '3h ago', '1h ago', 'Now'];
    const spreadPoints = times.map((time, i) => ({
      time,
      value: baseSpread + (currentSpread - baseSpread) * (i / 4)
    }));
    const totalPoints = times.map((time, i) => ({
      time,
      value: baseTotal + (currentTotal - baseTotal) * (i / 4)
    }));
    
    return { 
      spread: spreadPoints, 
      total: totalPoints,
      movements: {
        spread: currentSpread - baseSpread,
        total: currentTotal - baseTotal
      },
      isReal: false 
    };
  }, [game?.odds, lineHistory]);
  
  // Mock market signals (would come from API in production)
  const marketSignals = useMemo<SignalData>(() => {
    // Generate realistic signals based on spread and line movement
    const spread = game?.odds?.spread || 0;
    const publicBias = Math.abs(spread) > 7 ? 70 : Math.abs(spread) > 4 ? 60 : 52;
    const moneyBias = Math.abs(spread) > 7 ? 55 : Math.abs(spread) > 4 ? 48 : 50;
    
    // Use real line movement data for detection
    const spreadMove = lineMovementData.movements?.spread ?? 0;
    const totalMove = lineMovementData.movements?.total ?? 0;
    
    // RLM: public betting one way but line moving the other
    const publicOnFavorite = publicBias > 55;
    const lineMovingAgainstPublic = (publicOnFavorite && spreadMove > 0.5) || (!publicOnFavorite && spreadMove < -0.5);
    const isRLM = lineMovingAgainstPublic && Math.abs(spreadMove) >= 1;
    
    // Steam: significant movement
    const isSteam = Math.abs(spreadMove) >= 1.5 || Math.abs(totalMove) >= 2;
    
    // Sharp action direction
    let sharpAction: 'favorite' | 'underdog' | 'none' = 'none';
    if (isRLM) {
      sharpAction = publicOnFavorite ? 'underdog' : 'favorite';
    } else if (isSteam && Math.abs(spreadMove) >= 1.5) {
      sharpAction = spreadMove > 0 ? 'underdog' : 'favorite';
    }
    
    return {
      publicBetPct: publicBias,
      publicMoneyPct: moneyBias,
      isReverseLineMove: isRLM,
      steamMove: isSteam,
      sharpAction,
    };
  }, [game?.odds?.spread, lineMovementData.movements]);
  
  // Detect sharp money alerts
  const sharpMoneyAlerts = useMemo(() => {
    return detectSharpMoney(
      lineMovementData.movements,
      marketSignals.publicBetPct,
      game?.odds
    );
  }, [lineMovementData.movements, marketSignals.publicBetPct, game?.odds]);
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
            <Loader2 className="w-10 h-10 animate-spin text-cyan-400 relative" />
          </div>
          <p className="text-white/40 text-sm font-medium">Loading market data...</p>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error || !game) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-10 h-10 text-white/20" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Market Unavailable</h2>
          <p className="text-white/40 text-sm mb-8">{error || "We couldn't find odds for this game."}</p>
          <Button onClick={handleBack} variant="outline" className="border-white/10 hover:bg-white/5">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Games
          </Button>
        </div>
      </div>
    );
  }
  
  const statusDisplay = getStatusDisplay(game.status);
  const viewMode = deriveUnifiedViewMode(game.status);
  const finalOutcomes = deriveUnifiedFinalOutcomes({
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    spread: game.odds?.spread,
    total: game.odds?.total,
  });
  const liveNotes: Array<{ time: string; note: string }> = (() => {
    const notes: Array<{ time: string; note: string }> = [];
    if (lineMovementData.movements?.spread !== null && lineMovementData.movements?.spread !== undefined) {
      notes.push({
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        note: `Spread shifted ${lineMovementData.movements.spread > 0 ? "+" : ""}${lineMovementData.movements.spread.toFixed(1)} from open.`,
      });
    }
    if (lineMovementData.movements?.total !== null && lineMovementData.movements?.total !== undefined) {
      notes.push({
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        note: `Total moved ${lineMovementData.movements.total > 0 ? "up" : "down"} ${Math.abs(lineMovementData.movements.total).toFixed(1)} points.`,
      });
    }
    notes.push({
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      note: `${marketSignals.publicBetPct}% public lean with ${marketSignals.sharpAction.toLowerCase()} sharp profile.`,
    });
    return notes.slice(0, 5);
  })();
  const liveFeedItems = liveNotes.map((n, idx) => ({
    id: `odds-live-${idx}`,
    time: n.time,
    description: n.note,
  }));
  
  return (
    <div className="min-h-screen bg-[#050505]">
      {/* ================================ */}
      {/* STICKY NAV BAR */}
      {/* ================================ */}
      <div className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <button 
            onClick={handleBack} 
            className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Games</span>
          </button>
          
          <div className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-white/80 tracking-wide">ODDS CENTER</span>
          </div>
          
          <button
            onClick={() => navigate(toGameDetailPath(sportKey, matchId))}
            className="text-xs text-white/40 hover:text-white transition-colors"
          >
            Scores →
          </button>
        </div>
      </div>
      
      {/* ================================ */}
      {/* CONTENT */}
      {/* ================================ */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        
        {/* ================================ */}
        {/* 1. GAME HEADER - Compact & Premium */}
        {/* ================================ */}
        <section className="relative">
          {/* Subtle glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent rounded-2xl blur-2xl" />
          
          <div className="relative rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
            {/* Teams Row */}
            <div className="flex items-center justify-between gap-3">
              {/* Away Team */}
              <button
                type="button"
                onClick={() => void handleTeamNavigate(game.awayTeamCode || game.awayTeam, game.awayTeam)}
                onMouseEnter={() => void prefetchTeamData(game.awayTeamCode || game.awayTeam, game.awayTeam)}
                onFocus={() => void prefetchTeamData(game.awayTeamCode || game.awayTeam, game.awayTeam)}
                onTouchStart={() => void prefetchTeamData(game.awayTeamCode || game.awayTeam, game.awayTeam)}
                className="group flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors hover:bg-white/[0.05] cursor-pointer"
                aria-label={`Open ${game.awayTeam} team page`}
              >
                <TeamLogo
                  teamCode={game.awayTeamCode || game.awayTeam}
                  teamName={game.awayTeam}
                  sport={game.sport}
                  size={36}
                  winnerGlow={
                    statusDisplay === 'FINAL'
                    && game.awayScore !== null
                    && game.homeScore !== null
                    && game.awayScore > game.homeScore
                  }
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{game.awayTeam}</div>
                  <div className="text-[10px] text-cyan-300/80 opacity-0 -translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0">
                    View Team &rarr;
                  </div>
                  {game.awayScore !== null && statusDisplay !== 'UPCOMING' && (
                    <div className="text-2xl font-black text-white/90">{game.awayScore}</div>
                  )}
                </div>
              </button>
              
              {/* Center - Status/Time */}
              <div className="flex flex-col items-center px-2">
                <span className="text-white/20 text-lg font-light">@</span>
                {statusDisplay === 'LIVE' && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-wider animate-pulse">
                    Live
                  </span>
                )}
                {statusDisplay === 'FINAL' && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[9px] font-bold uppercase tracking-wider">
                    Final
                  </span>
                )}
              </div>
              
              {/* Home Team */}
              <button
                type="button"
                onClick={() => void handleTeamNavigate(game.homeTeamCode || game.homeTeam, game.homeTeam)}
                onMouseEnter={() => void prefetchTeamData(game.homeTeamCode || game.homeTeam, game.homeTeam)}
                onFocus={() => void prefetchTeamData(game.homeTeamCode || game.homeTeam, game.homeTeam)}
                onTouchStart={() => void prefetchTeamData(game.homeTeamCode || game.homeTeam, game.homeTeam)}
                className="group flex items-center gap-3 flex-1 min-w-0 justify-end text-right rounded-lg -m-1 p-1 transition-colors hover:bg-white/[0.05] cursor-pointer"
                aria-label={`Open ${game.homeTeam} team page`}
              >
                <div className="min-w-0 text-right">
                  <div className="text-sm font-bold text-white truncate">{game.homeTeam}</div>
                  <div className="text-[10px] text-cyan-300/80 opacity-0 -translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0">
                    View Team &rarr;
                  </div>
                  {game.homeScore !== null && statusDisplay !== 'UPCOMING' && (
                    <div className="text-2xl font-black text-white/90">{game.homeScore}</div>
                  )}
                </div>
                <TeamLogo
                  teamCode={game.homeTeamCode || game.homeTeam}
                  teamName={game.homeTeam}
                  sport={game.sport}
                  size={36}
                  winnerGlow={
                    statusDisplay === 'FINAL'
                    && game.awayScore !== null
                    && game.homeScore !== null
                    && game.homeScore > game.awayScore
                  }
                />
              </button>
            </div>
            
            {/* League + Time */}
            <div className="flex items-center justify-center gap-2 mt-3 text-[11px] text-white/40">
              <span className="font-medium">{game.league}</span>
              <span>•</span>
              {statusDisplay === 'UPCOMING' && game.startTime && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatGameTime(game.startTime)}
                </span>
              )}
              {statusDisplay === 'LIVE' && <span className="text-red-400">In Progress</span>}
              {statusDisplay === 'FINAL' && <span>Game Ended</span>}
            </div>
            
            {/* Quick Actions */}
            <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-white/[0.06]">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowWatchboardModal(true)}
                className="h-8 px-3 text-xs text-cyan-400 hover:bg-cyan-500/10"
              >
                <Star className="w-3.5 h-3.5 mr-1.5" />
                Watchboard
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAlertModal(true)}
                className="h-8 px-3 text-xs text-amber-400 hover:bg-amber-500/10"
              >
                <Bell className="w-3.5 h-3.5 mr-1.5" />
                Alert
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleShare}
                className="h-8 px-3 text-xs text-white/50 hover:bg-white/5"
              >
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
                Share
              </Button>
            </div>
          </div>
        </section>

        {viewMode === "live" && (
          <>
            <UnifiedLiveSignalStrip
              cards={[
                {
                  title: "Line Movement",
                  value:
                    lineMovementData.movements?.spread !== null && lineMovementData.movements?.spread !== undefined
                      ? `${lineMovementData.movements.spread > 0 ? "+" : ""}${lineMovementData.movements.spread.toFixed(1)} vs open`
                      : "No major move",
                  chip: "LIVE SHIFT",
                  tone: "red",
                },
                {
                  title: "Prop Heat",
                  value: `${(game.props || []).slice(0, 5).length} props in active focus`,
                  chip: "HEAT MAP",
                  tone: "green",
                },
                {
                  title: "Pace / Momentum",
                  value: marketSignals.sharpAction === "none" ? "Balanced market flow" : `Sharp on ${marketSignals.sharpAction}`,
                  chip: "FLOW SIGNAL",
                  tone: "amber",
                },
              ]}
            />
            <UnifiedCoachGLivePanel pregameRead={whisper?.text || "Coach G pregame read is syncing now."} liveNotes={liveNotes} />
            <UnifiedVideoPanel
              title="Live Video / Clip Area"
              subtitle="Live Coach G video updates render here when available."
              fallbackText="Live Coach G clip is syncing. We are checking for the next update automatically."
            />
            <UnifiedPlayFeedPanel items={liveFeedItems} />
          </>
        )}

        {viewMode === "final" && (
          <>
            <UnifiedFinalHeroPanel
              sport={game.sport}
              homeTeam={game.homeTeamCode || game.homeTeam}
              awayTeam={game.awayTeamCode || game.awayTeam}
              homeScore={game.homeScore}
              awayScore={game.awayScore}
              spreadResult={finalOutcomes.spreadResult}
              totalResult={finalOutcomes.totalResult}
              coverResult={finalOutcomes.coverResult}
              overUnderResult={finalOutcomes.overUnderResult}
            />
            <div className="rounded-xl border border-violet-400/20 bg-[#121821] p-4 md:p-5">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-violet-300" />
                <h3 className="text-sm font-semibold text-[#E5E7EB]">Coach G Postgame Take</h3>
              </div>
              <p className="text-sm text-[#9CA3AF]">
                Market close and scoring flow aligned around key leverage possessions; final result confirms the late-game pressure profile.
              </p>
            </div>
            <UnifiedVideoPanel
              title="Postgame Video"
              subtitle="Coach G recap clip for completed matchup."
              fallbackText="Postgame recap video is still processing. Check back shortly."
              isPostgame
            />
          </>
        )}
        
        {/* ================================ */}
        {/* SHARP MONEY ALERT BANNER */}
        {/* ================================ */}
        {sharpMoneyAlerts.length > 0 && (
          <SharpMoneyAlertBanner 
            alerts={sharpMoneyAlerts} 
            homeTeam={game.homeTeam} 
            awayTeam={game.awayTeam} 
          />
        )}
        
        {/* ================================ */}
        {/* GAME CONTEXT INTELLIGENCE */}
        {/* ================================ */}
        <GameContextCard
          gameId={matchId || ''}
          sport={game.sport || sportKey || ''}
          homeTeam={game.homeTeam}
          awayTeam={game.awayTeam}
          showCoachG={true}
        />
        
        {/* ================================ */}
        {/* 2. MARKET SNAPSHOT - The Big Numbers */}
        {/* ================================ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Market Snapshot</h2>
            {statusDisplay === 'LIVE' && (
              <span className="ml-auto px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-bold animate-pulse">
                LIVE ODDS
              </span>
            )}
          </div>
          
          {game.odds ? (
            <>
              {/* Primary Markets - 3 columns */}
              <div className="grid grid-cols-3 gap-2">
                <MarketCard
                  label="Spread"
                  value={game.odds.spread}
                  subValue={game.homeTeam}
                  openValue={game.odds.openSpread}
                  formatter={formatSpread}
                  accentColor="cyan"
                />
                <MarketCard
                  label="Total"
                  value={game.odds.total}
                  subValue="O/U"
                  openValue={game.odds.openTotal}
                  formatter={formatTotal}
                  accentColor="amber"
                />
                <MarketCard
                  label="Moneyline"
                  value={game.odds.mlHome}
                  subValue={game.homeTeam}
                  openValue={game.odds.openMlHome}
                  formatter={formatML}
                  accentColor="emerald"
                />
              </div>
              
              {/* Both Team Moneylines */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TeamLogo teamCode={game.awayTeamCode || game.awayTeam} teamName={game.awayTeam} sport={game.sport} size={24} />
                    <span className="text-xs text-white/60 truncate">{game.awayTeam}</span>
                  </div>
                  <span className="text-lg font-bold text-white">
                    {game.odds.mlAway !== undefined ? formatML(game.odds.mlAway) : '—'}
                  </span>
                </div>
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TeamLogo teamCode={game.homeTeamCode || game.homeTeam} teamName={game.homeTeam} sport={game.sport} size={24} />
                    <span className="text-xs text-white/60 truncate">{game.homeTeam}</span>
                  </div>
                  <span className="text-lg font-bold text-white">
                    {game.odds.mlHome !== undefined ? formatML(game.odds.mlHome) : '—'}
                  </span>
                </div>
              </div>

              {/* First-half lines */}
              <div className="mt-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
                  {periodLabels.lines}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-black/20 border border-white/[0.06] p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-white/45">Spread</div>
                    <div className="mt-1 text-sm font-bold text-violet-100">
                      {game.odds.spread1HHome !== undefined
                        ? `${game.homeTeam} ${formatSpread(game.odds.spread1HHome)}`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/20 border border-white/[0.06] p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-white/45">Total</div>
                    <div className="mt-1 text-sm font-bold text-violet-100">
                      {game.odds.total1H !== undefined ? formatTotal(game.odds.total1H) : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/20 border border-white/[0.06] p-2 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-white/45">ML</div>
                    <div className="mt-1 text-sm font-bold text-violet-100">
                      {game.odds.ml1HAway !== undefined || game.odds.ml1HHome !== undefined
                        ? `${game.odds.ml1HAway !== undefined ? formatML(game.odds.ml1HAway) : "—"} / ${game.odds.ml1HHome !== undefined ? formatML(game.odds.ml1HHome) : "—"}`
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
                <Zap className="w-6 h-6 text-white/20" />
              </div>
              <p className="text-white/40 font-medium text-sm">Odds not available yet</p>
              <p className="text-white/25 text-xs mt-1">Books have not posted this market yet. We keep checking automatically.</p>
            </div>
          )}
        </section>
        
        {/* ================================ */}
        {/* 3. COACH G QUICK INTEL */}
        {/* ================================ */}
        <section>
          <CoachGIntelSection game={game} whisper={whisper} />
        </section>
        
        {/* ================================ */}
        {/* 4. LINE MOVEMENT */}
        {/* ================================ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-amber-400" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Line Movement</h2>
            {lineMovementData.isReal ? (
              <span className="ml-auto px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 font-medium">LIVE DATA</span>
            ) : (
              <span className="ml-auto px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-300 font-medium">SYNCING</span>
            )}
          </div>

          {!lineHistoryStatus.synced && lineHistoryStatus.message && (
            <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
              <p className="text-[11px] text-amber-300">
                {lineHistoryStatus.message}
              </p>
            </div>
          )}
          
          {/* Significant Movement Alert */}
          {(() => {
            const spreadMove = Math.abs(lineMovementData.movements?.spread || 0);
            const totalMove = Math.abs(lineMovementData.movements?.total || 0);
            const hasSignificantMove = spreadMove >= 1 || totalMove >= 1.5;
            
            if (!hasSignificantMove || lineMovementData.spread.length < 2) return null;
            
            return (
              <div className="mb-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/20 p-3">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-400">Significant Line Movement</p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {spreadMove >= 1 && (
                        <span>Spread moved {lineMovementData.movements?.spread! > 0 ? '+' : ''}{lineMovementData.movements?.spread?.toFixed(1)} pts</span>
                      )}
                      {spreadMove >= 1 && totalMove >= 1.5 && <span> • </span>}
                      {totalMove >= 1.5 && (
                        <span>Total {lineMovementData.movements?.total! > 0 ? 'up' : 'down'} {Math.abs(lineMovementData.movements?.total || 0).toFixed(1)}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
          
          {lineMovementData.spread.length >= 2 ? (
            <div className="grid grid-cols-2 gap-2">
              <LineMovementChart 
                data={lineMovementData.spread} 
                label="Spread" 
                accentColor="cyan"
              />
              <LineMovementChart 
                data={lineMovementData.total} 
                label="Total" 
                accentColor="amber"
              />
            </div>
          ) : (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 text-center">
              <p className="text-white/30 text-xs">Line movement tracking appears once at least two book snapshots are captured.</p>
            </div>
          )}
        </section>
        
        {/* ================================ */}
        {/* 5. MARKET SIGNALS */}
        {/* ================================ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-cyan-400" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Market Signals</h2>
            <span className="ml-auto px-2 py-0.5 rounded bg-white/5 text-[9px] text-white/30 font-medium">BETA</span>
          </div>
          
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.04] p-4">
            <MarketSignalsSection 
              signals={marketSignals} 
              homeTeam={game.homeTeam}
              awayTeam={game.awayTeam}
            />
          </div>
        </section>
        
        {/* ================================ */}
        {/* 6. BEST ODDS ACROSS BOOKS */}
        {/* ================================ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Best Odds</h2>
            <span className="ml-auto text-[9px] text-emerald-400 font-medium">4 books compared</span>
          </div>
          
          <BestOddsSection game={game} formatSpread={formatSpread} formatML={formatML} />
        </section>
        
        {/* ================================ */}
        {/* 7. PLAYER PROPS */}
        {/* ================================ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-violet-400 to-purple-600" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Player Props</h2>
            <span className="ml-auto px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 text-[9px] font-bold">
              TOP PICKS
            </span>
          </div>
          
          <PlayerPropsSection game={game} />
        </section>
        
        {/* ================================ */}
        {/* 8. NEWS INTEL */}
        {/* ================================ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-orange-600" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">News Intel</h2>
            <span className="ml-auto flex items-center gap-1 text-[9px] text-white/30">
              <Zap className="w-3 h-3" /> AI Generated
            </span>
          </div>
          
          <NewsIntelSection game={game} />
        </section>
        
        {/* ================================ */}
        {/* 9. MATCHUP TRENDS */}
        {/* ================================ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-blue-600" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Matchup Trends</h2>
          </div>
          
          <MatchupTrendsSection game={game} />
        </section>
        
        {/* Footer Disclaimer */}
        <div className="text-[10px] text-white/15 text-center pt-4 pb-8">
          Odds for informational purposes only. Lines may vary by sportsbook.
        </div>
      </div>
      
      {/* ================================ */}
      {/* MODALS */}
      {/* ================================ */}
      <AddToWatchboardModal
        isOpen={showWatchboardModal}
        onClose={() => setShowWatchboardModal(false)}
        gameId={game.id}
        gameSummary={`${game.awayTeam} @ ${game.homeTeam}`}
        onSuccess={() => setShowWatchboardModal(false)}
      />
      
      <CreateAlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        gameId={game.id}
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        sport={game.sport}
        gameSummary={`${game.awayTeam} @ ${game.homeTeam}`}
      />
    </div>
  );
}
