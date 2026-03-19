/**
 * BetManualEntryPage - Premium bet builder
 * Desktop: Split-screen with games left, bet slip right
 * Mobile: Full-screen games with floating pill that navigates to review page
 * @module BetManualEntryPage
 * @updated 2025-01-23 - Cache invalidation fix
 */

import * as React from "react";
const { useState, useEffect } = React;
import { useNavigate, Link } from "react-router-dom";
import {
  Plus,
  Minus,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Search,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Camera,
  X,
  Sparkles,
  User,
  Gamepad2,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useBetSlip, BetLeg } from "@/react-app/hooks/useBetSlip";
import { useDataHub } from "@/react-app/hooks/useDataHub";
import { TeamLogo } from "@/react-app/components/TeamLogo";

// =====================================================
// TYPES
// =====================================================

interface Game {
  id: string;
  home_team: string;
  away_team: string;
  home_team_code?: string;
  away_team_code?: string;
  start_time: string;
  status: string;
  score_home?: number;
  score_away?: number;
  venue?: string;
  sport: string;
}

interface OddsMarket {
  spread_home?: number;
  spread_away?: number;
  spread_home_odds?: number;
  spread_away_odds?: number;
  moneyline_home?: number;
  moneyline_away?: number;
  total?: number;
  total_over_odds?: number;
  total_under_odds?: number;
}

interface GameWithOdds extends Game {
  odds?: OddsMarket;
}

interface PlayerProp {
  id: number;
  game_id: string;
  player_name: string;
  player_id?: string;
  team: string | null;
  sport: string;
  prop_type: string;
  line_value: number;
  over_odds?: number;
  under_odds?: number;
  home_team?: string;
  away_team?: string;
}

type Sport = "nba" | "nfl" | "mlb" | "nhl" | "ncaaf" | "ncaab" | "soccer";
type ViewMode = "games" | "props";

// =====================================================
// CONSTANTS
// =====================================================

const PROP_TYPE_LABELS: Record<string, string> = {
  POINTS: 'Points',
  REBOUNDS: 'Rebounds',
  ASSISTS: 'Assists',
  STEALS: 'Steals',
  BLOCKS: 'Blocks',
  THREES: '3-Pointers',
  PRA: 'Pts + Reb + Ast',
  PASSING_YARDS: 'Pass Yards',
  PASSING_TDS: 'Pass TDs',
  RUSHING_YARDS: 'Rush Yards',
  RECEIVING_YARDS: 'Rec Yards',
  RECEPTIONS: 'Receptions',
  HITS: 'Hits',
  RUNS: 'Runs',
  STRIKEOUTS: 'Strikeouts',
  GOALS: 'Goals',
  SHOTS: 'Shots',
  SAVES: 'Saves',
};

const SPORTS: { value: Sport; label: string; icon: string }[] = [
  { value: "nba", label: "NBA", icon: "🏀" },
  { value: "nfl", label: "NFL", icon: "🏈" },
  { value: "mlb", label: "MLB", icon: "⚾" },
  { value: "nhl", label: "NHL", icon: "🏒" },
  { value: "ncaaf", label: "NCAAF", icon: "🏈" },
  { value: "ncaab", label: "NCAAB", icon: "🏀" },
  { value: "soccer", label: "Soccer", icon: "⚽" },
];

function toTeamCode(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "TBD";
  if (/^[A-Za-z]{2,4}$/.test(raw)) return raw.toUpperCase();
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase();
  return tokens.map((t) => t[0]).join("").slice(0, 3).toUpperCase();
}

// =====================================================
// HELPERS
// =====================================================

function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateDisplay(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// =====================================================
// DATE NAVIGATOR
// =====================================================

interface DateNavigatorProps {
  selectedDate: Date;
  onChange: (date: Date) => void;
}

function DateNavigator({ selectedDate, onChange }: DateNavigatorProps) {
  const goToPrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    onChange(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    onChange(next);
  };

  const goToToday = () => {
    onChange(new Date());
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={goToPrevDay}
        className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all active:scale-95"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      
      <button
        onClick={goToToday}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all min-w-[140px] justify-center",
          isToday
            ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
            : "bg-slate-800/50 border-slate-700/50 text-slate-300 hover:border-slate-600"
        )}
      >
        <Calendar className="w-4 h-4" />
        <span className="text-sm font-medium">{formatDateDisplay(selectedDate)}</span>
      </button>
      
      <button
        onClick={goToNextDay}
        className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all active:scale-95"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// =====================================================
// BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-3xl" />
    </div>
  );
}

// =====================================================
// SPORT TABS
// =====================================================

interface SportTabsProps {
  selected: Sport;
  onChange: (sport: Sport) => void;
  loading?: boolean;
}

function SportTabs({ selected, onChange, loading }: SportTabsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/70 p-1.5 backdrop-blur-md">
      {SPORTS.map((sport) => (
        <button
          key={sport.value}
          onClick={() => onChange(sport.value)}
          disabled={loading}
          className={cn(
            "relative flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300",
            selected === sport.value
              ? "border border-blue-400/40 bg-gradient-to-r from-blue-600/80 to-cyan-500/80 text-white shadow-[0_0_18px_rgba(59,130,246,0.35)]"
              : "border border-transparent text-slate-400 hover:border-slate-600/60 hover:bg-slate-800/70 hover:text-slate-200 active:scale-95"
          )}
        >
          <span className="relative z-10 text-base">{sport.icon}</span>
          <span className="relative z-10 hidden sm:inline">{sport.label}</span>
          {selected === sport.value && (
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-white/80" />
          )}
        </button>
      ))}
    </div>
  );
}

// =====================================================
// VIEW MODE TABS
// =====================================================

interface ViewModeTabsProps {
  selected: ViewMode;
  onChange: (mode: ViewMode) => void;
}

function ViewModeTabs({ selected, onChange }: ViewModeTabsProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-slate-700/50 bg-slate-900/60 p-1">
      <button
        onClick={() => onChange("games")}
        className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
          selected === "games"
            ? "border border-blue-500/35 bg-blue-500/20 text-blue-200 shadow-[0_0_14px_rgba(59,130,246,0.24)]"
            : "border border-transparent text-slate-400 hover:border-slate-600/70 hover:bg-slate-800/60 hover:text-slate-200"
        )}
      >
        <Gamepad2 className="w-4 h-4" />
        Games
      </button>
      <button
        onClick={() => onChange("props")}
        className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
          selected === "props"
            ? "border border-purple-500/35 bg-gradient-to-r from-purple-600/70 to-pink-600/70 text-white shadow-[0_0_14px_rgba(168,85,247,0.24)]"
            : "border border-transparent text-slate-400 hover:border-slate-600/70 hover:bg-slate-800/60 hover:text-slate-200"
        )}
      >
        <User className="w-4 h-4" />
        Player Props
      </button>
    </div>
  );
}

// =====================================================
// PROP CARD
// =====================================================

interface PropCardProps {
  prop: PlayerProp;
  onAddLeg: (leg: Omit<BetLeg, "id">) => void;
  isInSlip: (gameId: string, marketType: string, side: string) => boolean;
}

function PropCard({ prop, onAddLeg, isInSlip }: PropCardProps) {
  const formatOdds = (odds?: number) => {
    if (!odds) return "-110";
    return odds > 0 ? `+${odds}` : `${odds}`;
  };

  const propLabel = PROP_TYPE_LABELS[prop.prop_type] || prop.prop_type;
  const matchup = prop.home_team && prop.away_team 
    ? `${prop.away_team} @ ${prop.home_team}` 
    : prop.team || "";

  const marketType = `player_${prop.prop_type.toLowerCase()}`;
  const isOverInSlip = isInSlip(prop.game_id, marketType, "over");
  const isUnderInSlip = isInSlip(prop.game_id, marketType, "under");
  const teamCode = toTeamCode(prop.team || "");

  const createPropLeg = (side: "over" | "under"): Omit<BetLeg, "id"> => ({
    sport: prop.sport.toLowerCase(),
    league: prop.sport.toUpperCase(),
    gameId: prop.game_id,
    gameName: matchup,
    homeTeam: prop.home_team || "",
    awayTeam: prop.away_team || "",
    teamOrPlayer: prop.player_name,
    opponentOrContext: `${propLabel} ${side === "over" ? "Over" : "Under"} ${prop.line_value}`,
    marketType: marketType,
    side: side,
    marketLine: String(prop.line_value),
    userLine: String(prop.line_value),
    marketOdds: formatOdds(side === "over" ? prop.over_odds : prop.under_odds),
    userOdds: formatOdds(side === "over" ? prop.over_odds : prop.under_odds),
    startTime: new Date().toISOString(),
  });

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/45 p-4 transition-all hover:border-slate-600/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <TeamLogo teamCode={teamCode} sport={prop.sport.toUpperCase()} size={30} className="shrink-0" />
          <div>
            <p className="font-semibold text-slate-200">{prop.player_name}</p>
            <p className="text-xs text-slate-500">{prop.team || teamCode}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-purple-400">{propLabel}</p>
          <p className="text-xs text-slate-500">{matchup}</p>
        </div>
      </div>

      <div className="flex items-center justify-center mb-3 py-2 rounded-lg bg-slate-900/50">
        <span className="text-2xl font-bold text-slate-200">{prop.line_value}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => !isOverInSlip && onAddLeg(createPropLeg("over"))}
          disabled={isOverInSlip}
          className={cn(
            "p-3 rounded-lg border text-center transition-all duration-200",
            isOverInSlip
              ? "bg-emerald-500/20 border-emerald-500/50 cursor-default"
              : "bg-slate-800/50 border-slate-600/50 hover:border-green-500/50 hover:bg-green-500/10 cursor-pointer"
          )}
        >
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-slate-200">Over</span>
          </div>
          <span className="text-sm font-bold text-green-400">{formatOdds(prop.over_odds)}</span>
          {isOverInSlip && (
            <div className="flex items-center justify-center gap-1 mt-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-xs">Added</span>
            </div>
          )}
        </button>
        <button
          onClick={() => !isUnderInSlip && onAddLeg(createPropLeg("under"))}
          disabled={isUnderInSlip}
          className={cn(
            "p-3 rounded-lg border text-center transition-all duration-200",
            isUnderInSlip
              ? "bg-emerald-500/20 border-emerald-500/50 cursor-default"
              : "bg-slate-800/50 border-slate-600/50 hover:border-red-500/50 hover:bg-red-500/10 cursor-pointer"
          )}
        >
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-4 h-4 text-red-400 rotate-180" />
            <span className="text-sm font-medium text-slate-200">Under</span>
          </div>
          <span className="text-sm font-bold text-red-400">{formatOdds(prop.under_odds)}</span>
          {isUnderInSlip && (
            <div className="flex items-center justify-center gap-1 mt-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-xs">Added</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

// =====================================================
// GAME CARD
// =====================================================

interface GameCardProps {
  game: GameWithOdds;
  expanded: boolean;
  onToggle: () => void;
  onAddLeg: (leg: Omit<BetLeg, "id">) => void;
  isInSlip: (gameId: string, marketType: string, side: string) => boolean;
}

function GameCard({ game, expanded, onToggle, onAddLeg, isInSlip }: GameCardProps) {
  const formatTime = (time: string) => {
    const d = new Date(time);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const formatDate = (time: string) => {
    const d = new Date(time);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const isLive = game.status === "IN_PROGRESS" || game.status === "in_progress";
  const isFinal = game.status === "FINAL" || game.status === "final";
  const sportUpper = game.sport.toUpperCase();
  const awayCode = toTeamCode(game.away_team_code || game.away_team);
  const homeCode = toTeamCode(game.home_team_code || game.home_team);

  const formatOdds = (odds?: number) => {
    if (!odds) return "-";
    return odds > 0 ? `+${odds}` : `${odds}`;
  };

  const formatSpread = (spread?: number) => {
    if (spread === undefined || spread === null) return "-";
    return spread > 0 ? `+${spread}` : `${spread}`;
  };

  const createLeg = (marketType: string, side: string, line: string, odds: string): Omit<BetLeg, "id"> => ({
    sport: game.sport,
    league: game.sport.toUpperCase(),
    gameId: game.id,
    gameName: `${game.away_team} @ ${game.home_team}`,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    teamOrPlayer: side,
    opponentOrContext: side === game.home_team ? `vs ${game.away_team}` : side === game.away_team ? `@ ${game.home_team}` : `${game.away_team} @ ${game.home_team}`,
    marketType,
    side,
    marketLine: line,
    userLine: line,
    marketOdds: odds,
    userOdds: odds,
    startTime: game.start_time,
  });

  const odds = game.odds || {};
  const spreadSelected =
    isInSlip(game.id, "spread", game.away_team) ||
    isInSlip(game.id, "spread", game.home_team);
  const moneylineSelected =
    isInSlip(game.id, "moneyline", game.away_team) ||
    isInSlip(game.id, "moneyline", game.home_team);
  const totalSelected =
    isInSlip(game.id, "total", "over") ||
    isInSlip(game.id, "total", "under");
  const selectedCount = [spreadSelected, moneylineSelected, totalSelected].filter(Boolean).length;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-300 overflow-hidden relative",
        expanded
          ? "bg-slate-800/70 border-blue-500/50 shadow-lg shadow-blue-500/15"
          : "bg-slate-800/35 border-slate-700/50 hover:border-slate-600/70"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-[10px] font-bold tracking-wider text-blue-300">
              {sportUpper}
            </span>
            {selectedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                {selectedCount} PICK{selectedCount > 1 ? "S" : ""}
              </span>
            )}
            {isLive && (
              <span className="flex items-center gap-1 text-xs font-bold text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
            {isFinal && <span className="text-xs font-medium text-slate-500">FINAL</span>}
            {!isLive && !isFinal && (
              <span className="text-xs text-slate-500">
                {formatDate(game.start_time)} • {formatTime(game.start_time)}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <TeamLogo
                  teamCode={awayCode}
                  sport={sportUpper}
                  size={24}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{game.away_team}</p>
                  <p className="text-[11px] text-slate-500">{awayCode}</p>
                </div>
              </div>
              {(isLive || isFinal) && typeof game.score_away === "number" && (
                <span className="text-lg font-bold tabular-nums text-slate-100">{game.score_away}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <TeamLogo
                  teamCode={homeCode}
                  sport={sportUpper}
                  size={24}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{game.home_team}</p>
                  <p className="text-[11px] text-slate-500">{homeCode}</p>
                </div>
              </div>
              {(isLive || isFinal) && typeof game.score_home === "number" && (
                <span className="text-lg font-bold tabular-nums text-slate-100">{game.score_home}</span>
              )}
            </div>
            {game.venue && (
              <p className="text-[11px] text-slate-500 truncate">{game.venue}</p>
            )}
          </div>
        </div>
        <ChevronRight
          className={cn(
            "w-5 h-5 text-slate-400 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {/* Spread */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Spread</p>
            <div className="grid grid-cols-2 gap-2">
              <MarketButton
                team={game.away_team}
                line={formatSpread(odds.spread_away)}
                odds={formatOdds(odds.spread_away_odds)}
                selected={isInSlip(game.id, "spread", game.away_team)}
                onClick={() => {
                  if (!isInSlip(game.id, "spread", game.away_team) && odds.spread_away !== undefined) {
                    onAddLeg(createLeg("spread", game.away_team, String(odds.spread_away), String(odds.spread_away_odds || -110)));
                  }
                }}
                disabled={odds.spread_away === undefined}
              />
              <MarketButton
                team={game.home_team}
                line={formatSpread(odds.spread_home)}
                odds={formatOdds(odds.spread_home_odds)}
                selected={isInSlip(game.id, "spread", game.home_team)}
                onClick={() => {
                  if (!isInSlip(game.id, "spread", game.home_team) && odds.spread_home !== undefined) {
                    onAddLeg(createLeg("spread", game.home_team, String(odds.spread_home), String(odds.spread_home_odds || -110)));
                  }
                }}
                disabled={odds.spread_home === undefined}
              />
            </div>
          </div>

          {/* Moneyline */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Moneyline</p>
            <div className="grid grid-cols-2 gap-2">
              <MarketButton
                team={game.away_team}
                odds={formatOdds(odds.moneyline_away)}
                selected={isInSlip(game.id, "moneyline", game.away_team)}
                onClick={() => {
                  if (!isInSlip(game.id, "moneyline", game.away_team) && odds.moneyline_away !== undefined) {
                    onAddLeg(createLeg("moneyline", game.away_team, "", String(odds.moneyline_away)));
                  }
                }}
                disabled={odds.moneyline_away === undefined}
              />
              <MarketButton
                team={game.home_team}
                odds={formatOdds(odds.moneyline_home)}
                selected={isInSlip(game.id, "moneyline", game.home_team)}
                onClick={() => {
                  if (!isInSlip(game.id, "moneyline", game.home_team) && odds.moneyline_home !== undefined) {
                    onAddLeg(createLeg("moneyline", game.home_team, "", String(odds.moneyline_home)));
                  }
                }}
                disabled={odds.moneyline_home === undefined}
              />
            </div>
          </div>

          {/* Total */}
          {odds.total && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
              <div className="grid grid-cols-2 gap-2">
                <MarketButton
                  team="Over"
                  line={String(odds.total)}
                  odds={formatOdds(odds.total_over_odds)}
                  selected={isInSlip(game.id, "total", "over")}
                  onClick={() => {
                    if (!isInSlip(game.id, "total", "over")) {
                      const leg = createLeg("total", "over", String(odds.total), String(odds.total_over_odds || -110));
                      leg.teamOrPlayer = "Over";
                      onAddLeg(leg);
                    }
                  }}
                />
                <MarketButton
                  team="Under"
                  line={String(odds.total)}
                  odds={formatOdds(odds.total_under_odds)}
                  selected={isInSlip(game.id, "total", "under")}
                  onClick={() => {
                    if (!isInSlip(game.id, "total", "under")) {
                      const leg = createLeg("total", "under", String(odds.total), String(odds.total_under_odds || -110));
                      leg.teamOrPlayer = "Under";
                      onAddLeg(leg);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================
// MARKET BUTTON
// =====================================================

interface MarketButtonProps {
  team: string;
  line?: string;
  odds: string;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function MarketButton({ team, line, odds, selected, onClick, disabled }: MarketButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || selected}
      className={cn(
        "relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
        selected
          ? "border-emerald-500/60 bg-gradient-to-br from-emerald-500/25 to-emerald-600/15 shadow-lg shadow-emerald-500/15"
          : disabled
          ? "bg-slate-800/30 border-slate-700/30 cursor-not-allowed opacity-50"
          : "cursor-pointer border-slate-600/40 bg-gradient-to-br from-slate-800/60 to-slate-800/30 hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/15 active:scale-[0.98]"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {selected && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-emerald-400/35 animate-pulse" />
      )}
      <p className="text-sm font-medium text-slate-200 truncate">{team}</p>
      <div className="flex items-center gap-2 mt-1">
        {line && <span className="text-sm font-bold text-blue-400">{line}</span>}
        <span className={cn("text-sm", line ? "text-slate-400" : "font-bold text-blue-400")}>{odds}</span>
      </div>
      {selected && (
        <div className="mt-1.5 flex items-center gap-1 text-emerald-300 animate-in fade-in duration-300">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Added</span>
        </div>
      )}
    </button>
  );
}

// =====================================================
// DESKTOP BET SLIP CARD
// =====================================================

interface DesktopBetSlipCardProps {
  leg: BetLeg;
  index: number;
  onUpdate: (leg: BetLeg) => void;
  onRemove: () => void;
}

function DesktopBetSlipCard({ leg, index, onUpdate, onRemove }: DesktopBetSlipCardProps) {
  const adjustLine = (delta: number) => {
    const current = parseFloat(leg.userLine) || 0;
    const newValue = current + delta;
    onUpdate({ ...leg, userLine: newValue.toString() });
  };

  const hasModifiedLine = leg.userLine !== leg.marketLine && leg.marketLine !== "";

  return (
    <div className="group relative p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all z-10"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
        <span className="text-xs font-bold text-white">{index + 1}</span>
      </div>

      <div className="space-y-3 pt-1">
        <div>
          <p className="font-semibold text-slate-100">{leg.teamOrPlayer}</p>
          <p className="text-xs text-slate-400">{leg.opponentOrContext}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-700/50 text-slate-300 capitalize">
            {leg.marketType.replace("_", " ")}
          </span>
        </div>

        {leg.marketLine && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Your Line</span>
              {hasModifiedLine && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Modified
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustLine(-0.5)}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-blue-500/20 border border-transparent text-slate-300 hover:text-blue-300 transition-all active:scale-95"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={leg.userLine}
                onChange={(e) => onUpdate({ ...leg, userLine: e.target.value })}
                className={cn(
                  "flex-1 text-center px-3 py-2 rounded-lg border text-lg font-bold transition-all duration-200 focus:ring-2 focus:ring-blue-500/50 focus:outline-none",
                  hasModifiedLine
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                    : "bg-slate-700/50 border-slate-600 text-slate-100"
                )}
              />
              <button
                onClick={() => adjustLine(0.5)}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-blue-500/20 border border-transparent text-slate-300 hover:text-blue-300 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {hasModifiedLine && (
              <p className="text-xs text-slate-500">Market: {leg.marketLine}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// MOBILE FLOATING PILL
// =====================================================

interface FloatingPillProps {
  count: number;
  onClick: () => void;
}

function FloatingPill({ count, onClick }: FloatingPillProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-24 left-0 right-0 z-50 flex justify-center px-4 md:hidden">
      <button
        onClick={onClick}
        className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white font-semibold shadow-2xl shadow-emerald-500/30 active:scale-95 transition-transform"
      >
        <div className="relative">
          <Sparkles className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-emerald-600 text-[10px] font-bold flex items-center justify-center">
            {count}
          </span>
        </div>
        <span>Review {count} Pick{count !== 1 ? "s" : ""}</span>
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

function BetManualEntryPage() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();

  // Use shared bet slip hook
  const { legs, addLeg, updateLeg, removeLeg, isInSlip, count } = useBetSlip();

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("games");

  // Date selection
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Sport & games
  const [selectedSport, setSelectedSport] = useState<Sport>("nba");
  const [games, setGames] = useState<GameWithOdds[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Player props
  const [props, setProps] = useState<PlayerProp[]>([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [propSearchTerm, setPropSearchTerm] = useState("");

  // Desktop save state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get shared data hub for instant loading when viewing today's games
  const { games: hubGames, gamesLoading: hubLoading } = useDataHub();

  // Transform hub games to GameWithOdds format, filtered by sport
  const hubGamesFiltered = React.useMemo(() => {
    if (!hubGames || hubGames.length === 0) return [];
    const sportUpper = selectedSport.toUpperCase();
    return hubGames
      .filter(g => g.sport?.toUpperCase() === sportUpper)
      .map(g => ({
        id: g.id,
        home_team: g.homeTeam?.name || 'TBD',
        away_team: g.awayTeam?.name || 'TBD',
        home_team_code: g.homeTeam?.abbreviation || g.homeTeam?.name || 'TBD',
        away_team_code: g.awayTeam?.abbreviation || g.awayTeam?.name || 'TBD',
        start_time: g.startTime || new Date().toISOString(),
        status: g.status,
        score_home: g.homeTeam?.score,
        score_away: g.awayTeam?.score,
        venue: undefined,
        sport: selectedSport,
        odds: g.odds ? {
          spread_home: g.odds.spreadHome ?? undefined,
          spread_away: undefined,
          spread_home_odds: -110,
          spread_away_odds: -110,
          moneyline_home: g.odds.moneylineHome ?? undefined,
          moneyline_away: g.odds.moneylineAway ?? undefined,
          total: g.odds.total ?? undefined,
          total_over_odds: -110,
          total_under_odds: -110,
        } : undefined,
      })) as GameWithOdds[];
  }, [hubGames, selectedSport]);

  // Check if selected date is today
  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // Load games when sport or date changes - use hub data for instant display on today
  useEffect(() => {
    // If today and we have hub games, show them instantly
    if (isToday && hubGamesFiltered.length > 0 && !hubLoading) {
      setGames(hubGamesFiltered);
      setLoadingGames(false);
    } else if (!isToday || hubGamesFiltered.length === 0) {
      setLoadingGames(true);
      setGames([]);
    }
    setExpandedGameId(null);

    // Always fetch accurate date-specific data
    const dateStr = formatDateForApi(selectedDate);
    fetch(`/api/games?sport=${selectedSport}&date=${dateStr}`)
      .then((r) => r.json())
      .then((data) => {
        const rawGames = data.games || [];
        const gamesWithOdds: GameWithOdds[] = rawGames.map((g: any) => ({
          id: g.game_id || g.id,
          home_team: g.home_team_name || g.home_team,
          away_team: g.away_team_name || g.away_team,
          home_team_code: g.home_team_code || g.homeTeamCode || g.home_team,
          away_team_code: g.away_team_code || g.awayTeamCode || g.away_team,
          start_time: g.start_time,
          status: g.status,
          score_home: g.score_home || g.homeScore,
          score_away: g.score_away || g.awayScore,
          venue: g.venue,
          sport: selectedSport,
          odds: {
            spread_home: g.spread,
            spread_away: g.spreadAway,
            spread_home_odds: g.spreadOddsHome || -110,
            spread_away_odds: g.spreadOddsAway || -110,
            moneyline_home: g.moneylineHome,
            moneyline_away: g.moneylineAway,
            total: g.overUnder,
            total_over_odds: g.overOdds || -110,
            total_under_odds: g.underOdds || -110,
          },
        }));
        setGames(gamesWithOdds);
      })
      .catch(() => {
        // On error, keep hub games if available
        if (!isToday || hubGamesFiltered.length === 0) {
          setGames([]);
        }
      })
      .finally(() => setLoadingGames(false));
  }, [selectedSport, selectedDate, isToday, hubGamesFiltered, hubLoading]);

  // Load props when view mode is props
  useEffect(() => {
    if (viewMode !== "props") return;
    
    setLoadingProps(true);
    setProps([]);
    
    const dateStr = formatDateForApi(selectedDate);
    fetch(`/api/sports-data/props/today?sport=${selectedSport}&date=${dateStr}`)
      .then((r) => r.json())
      .then((data) => {
        const rawProps = data.props || [];
        setProps(rawProps);
      })
      .catch(() => setProps([]))
      .finally(() => setLoadingProps(false));
  }, [viewMode, selectedSport, selectedDate]);

  // Filter games by search
  const filteredGames = games.filter((g) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return g.home_team.toLowerCase().includes(term) || g.away_team.toLowerCase().includes(term);
  });

  // Filter props by search
  const filteredProps = props.filter((p) => {
    if (!propSearchTerm) return true;
    const term = propSearchTerm.toLowerCase();
    return (
      p.player_name.toLowerCase().includes(term) ||
      (p.team && p.team.toLowerCase().includes(term)) ||
      p.prop_type.toLowerCase().includes(term)
    );
  });

  // Desktop save handler
  const handleDesktopSave = async () => {
    if (count === 0) return;

    if (!user) {
      navigate("/login");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const ticketType = count > 1 ? "parlay" : "single";
      const response = await fetch("/api/bet-tickets", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(user?.id ? { "x-user-id": user.id.toString() } : {}),
        },
        body: JSON.stringify({
          title: `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} - ${count} pick${count !== 1 ? "s" : ""}`,
          sportsbook: "Unknown",
          ticket_type: ticketType,
          stake_amount: null,
          to_win_amount: null,
          total_odds: null,
          status: "draft",
          source: "manual",
          legs: legs.map((leg, i) => ({
            leg_index: i,
            sport: leg.sport,
            league: leg.league,
            event_id: leg.gameId,
            team_or_player: leg.teamOrPlayer,
            opponent_or_context: leg.opponentOrContext,
            market_type: leg.marketType,
            side: leg.side,
            user_line_value: leg.userLine || null,
            user_odds: leg.userOdds || null,
            confidence_score: 100,
            is_needs_review: false,
            raw_text: null,
            leg_status: "Pending",
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create watchboard");
      }

      const result = await response.json();
      
      const confirmResponse = await fetch(`/api/bet-tickets/${result.ticket_id}/confirm`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(user?.id ? { "x-user-id": user.id.toString() } : {}),
        },
      });

      if (!confirmResponse.ok) {
        throw new Error("Failed to create watchboard");
      }

      const confirmResult = await confirmResponse.json();
      
      // Clear localStorage slip after successful save
      localStorage.removeItem('gz-bet-slip');
      
      if (confirmResult.watchboard_id) {
        navigate(`/watchboard/${confirmResult.watchboard_id}`);
      } else {
        navigate("/watchboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-36 md:pb-0">
      <CinematicBackground />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-blue-500/20 bg-slate-950/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 p-2 shadow-[0_0_20px_rgba(16,185,129,0.24)]">
                <Ticket className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-100">Build Your Ticket</h1>
                <p className="hidden text-xs text-slate-400 sm:block">First-class builder: logos, lines, props, and premium market controls.</p>
              </div>
            </div>
          </div>
          <Link
            to="/bet/upload"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
          >
            <Camera className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Upload Screenshot</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 md:h-[calc(100vh-73px)] flex flex-col">
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left Panel - Browse Games/Props */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Controls Row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 shrink-0">
              <ViewModeTabs selected={viewMode} onChange={setViewMode} />
              <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} />
            </div>

            {/* Sport Tabs */}
            <div className="shrink-0 mb-4">
              <SportTabs
                selected={selectedSport}
                onChange={setSelectedSport}
                loading={viewMode === "games" ? loadingGames : loadingProps}
              />
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-2">
              {viewMode === "games" ? (
                <div className="space-y-4">
                  {/* Search */}
                  <div className="relative sticky top-0 z-10 pb-2 bg-gradient-to-b from-slate-950 via-slate-950 to-transparent">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search teams..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors backdrop-blur-sm"
                    />
                  </div>

                  {/* Games List */}
                  <div className="space-y-3 pb-4">
                    {loadingGames ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin mb-3" />
                        <p>Loading games...</p>
                      </div>
                    ) : filteredGames.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Calendar className="w-12 h-12 text-slate-600 mb-3" />
                        <p className="text-lg mb-1">No games found</p>
                        <p className="text-sm text-slate-500 text-center">
                          {games.length === 0
                            ? `No ${selectedSport.toUpperCase()} games on ${formatDateDisplay(selectedDate)}`
                            : "Try adjusting your search"}
                        </p>
                        <button
                          onClick={() => setSelectedDate(new Date())}
                          className="mt-4 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/30 transition-colors"
                        >
                          Go to Today
                        </button>
                      </div>
                    ) : (
                      filteredGames.map((game) => (
                        <GameCard
                          key={game.id}
                          game={game}
                          expanded={expandedGameId === game.id}
                          onToggle={() => setExpandedGameId(expandedGameId === game.id ? null : game.id)}
                          onAddLeg={addLeg}
                          isInSlip={isInSlip}
                        />
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Player Props Search */}
                  <div className="relative sticky top-0 z-10 pb-2 bg-gradient-to-b from-slate-950 via-slate-950 to-transparent">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search players, teams, or prop types..."
                      value={propSearchTerm}
                      onChange={(e) => setPropSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition-colors backdrop-blur-sm"
                    />
                  </div>

                  {/* Props List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                    {loadingProps ? (
                      <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin mb-3" />
                        <p>Loading player props...</p>
                      </div>
                    ) : filteredProps.length === 0 ? (
                      <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
                        <User className="w-12 h-12 text-slate-600 mb-3" />
                        <p className="text-lg mb-1">No props available</p>
                        <p className="text-sm text-slate-500">
                          {props.length === 0
                            ? `No ${selectedSport.toUpperCase()} player props available`
                            : "Try adjusting your search"}
                        </p>
                      </div>
                    ) : (
                      filteredProps.slice(0, 50).map((prop) => (
                        <PropCard
                          key={`${prop.id}-${prop.player_name}-${prop.prop_type}`}
                          prop={prop}
                          onAddLeg={addLeg}
                          isInSlip={isInSlip}
                        />
                      ))
                    )}
                  </div>

                  {filteredProps.length > 50 && (
                    <p className="text-center text-sm text-slate-500 pb-4">
                      Showing first 50 of {filteredProps.length} props. Use search to narrow results.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Bet Slip (Desktop Only) */}
          <div className="hidden md:flex w-96 shrink-0 flex-col min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4 pb-4">
              {/* Slip Header */}
              <div className="relative p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className={cn(
                      "w-5 h-5 transition-colors duration-300",
                      count > 0 ? "text-emerald-400" : "text-slate-500"
                    )} />
                    <h2 className="text-lg font-bold text-slate-100">Your Picks</h2>
                  </div>
                  {count > 0 && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-blue-500/30 to-emerald-500/20 text-blue-300 border border-blue-500/30">
                      {count} {count === 1 ? "pick" : "picks"}
                    </span>
                  )}
                </div>
              </div>

              {/* Legs */}
              {count === 0 ? (
                <div className="p-8 rounded-xl border-2 border-dashed border-slate-700/50 text-center">
                  <div className="w-14 h-14 rounded-xl bg-slate-800/80 flex items-center justify-center mx-auto mb-4 border border-slate-600/30">
                    <Plus className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-slate-300 font-medium mb-1">No picks yet</p>
                  <p className="text-sm text-slate-500">
                    Click on a spread, moneyline, or total to add it
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {legs.map((leg, index) => (
                    <DesktopBetSlipCard
                      key={leg.id}
                      leg={leg}
                      index={index}
                      onUpdate={(updated) => updateLeg(index, updated)}
                      onRemove={() => removeLeg(index)}
                    />
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Save Button */}
              {count > 0 && (
                <Button
                  onClick={handleDesktopSave}
                  disabled={saving}
                  className="w-full h-14 text-base gap-3 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Ticket className="w-5 h-5" />
                      Create Your Ticket Watchboard
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Pill - navigates to review page */}
      <FloatingPill count={count} onClick={() => navigate("/bet/review")} />
    </div>
  );
}

export default BetManualEntryPage;
