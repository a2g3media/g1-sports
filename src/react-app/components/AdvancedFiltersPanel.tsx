/**
 * Elite Advanced Filters Panel
 * 
 * Slide-out filter panel for Command Center and Scores pages.
 * Elite-only feature with sport-aware game state detection.
 * 
 * FRONTEND ONLY - does not touch push/alert systems
 */

import { useState } from "react";
import { 
  X, RotateCcw, Filter, ChevronDown, ChevronUp,
  Zap, Activity, TrendingUp, Clock, Target,
  AlertTriangle, Trophy, Shield
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";

import { Slider } from "@/react-app/components/ui/slider";
import { cn } from "@/react-app/lib/utils";

// =====================================================
// TYPES
// =====================================================

export type GameStateFilter = 
  | "live_only"
  | "upcoming_only" 
  | "close_games"
  | "overtime";

export type PerformanceFilter =
  | "high_scoring"
  | "low_scoring"
  | "upset_watch"
  | "blowout_watch";

export type OddsFilter =
  | "significant_line_move"
  | "high_total_movement"
  | "moneyline_swing";

export interface AdvancedFilters {
  gameState: GameStateFilter[];
  performance: PerformanceFilter[];
  odds: OddsFilter[];
  lineMovementThreshold: number; // percentage for significant move
}

export const DEFAULT_FILTERS: AdvancedFilters = {
  gameState: [],
  performance: [],
  odds: [],
  lineMovementThreshold: 10, // 10% default
};

// =====================================================
// SPORT-AWARE THRESHOLDS
// =====================================================

export const CLOSE_GAME_THRESHOLDS: Record<string, number> = {
  nfl: 7,      // Within one score
  ncaaf: 7,
  nba: 6,      // Within 2 possessions
  ncaab: 6,
  mlb: 1,      // Within 1 run (late innings)
  nhl: 1,      // Within 1 goal
  soccer: 1,   // Within 1 goal
};

export const HIGH_SCORING_THRESHOLDS: Record<string, number> = {
  nfl: 56,     // Combined score
  ncaaf: 63,
  nba: 230,
  ncaab: 160,
  mlb: 12,
  nhl: 8,
  soccer: 5,
};

export const LOW_SCORING_THRESHOLDS: Record<string, number> = {
  nfl: 24,
  ncaaf: 28,
  nba: 180,
  ncaab: 120,
  mlb: 4,
  nhl: 3,
  soccer: 1,
};

export const BLOWOUT_THRESHOLDS: Record<string, number> = {
  nfl: 17,     // 2+ scores
  ncaaf: 21,
  nba: 20,
  ncaab: 20,
  mlb: 5,
  nhl: 3,
  soccer: 3,
};

// =====================================================
// FILTER LOGIC
// =====================================================

export interface GameForFilter {
  id?: string;
  game_id?: string;
  sport: string;
  status: string;
  home_score?: number;
  away_score?: number;
  homeTeam?: { score: number };
  awayTeam?: { score: number };
  period?: string;
  period_label?: string;
  odds?: {
    spread?: string;
    openingSpread?: number;
    currentSpread?: number;
    totalMovement?: number;
    moneylineSwing?: number;
  };
  isUnderdog?: boolean;
  underdogLeading?: boolean;
}

export function applyAdvancedFilters<T extends GameForFilter>(
  games: T[],
  filters: AdvancedFilters
): T[] {
  // No filters active = return all games
  if (
    filters.gameState.length === 0 &&
    filters.performance.length === 0 &&
    filters.odds.length === 0
  ) {
    return games;
  }

  return games.filter(game => {
    const homeScore = game.home_score ?? game.homeTeam?.score ?? 0;
    const awayScore = game.away_score ?? game.awayTeam?.score ?? 0;
    const totalScore = homeScore + awayScore;
    const scoreDiff = Math.abs(homeScore - awayScore);
    const sport = game.sport?.toLowerCase() || 'nfl';
    const isLive = game.status === 'IN_PROGRESS' || game.status === 'live';
    const isScheduled = game.status === 'SCHEDULED' || game.status === 'scheduled';
    const period = game.period || game.period_label || '';

    // Game State Filters (OR logic within category)
    if (filters.gameState.length > 0) {
      const matchesGameState = filters.gameState.some(filter => {
        switch (filter) {
          case 'live_only':
            return isLive;
          case 'upcoming_only':
            return isScheduled;
          case 'close_games':
            if (!isLive) return false;
            const closeThreshold = CLOSE_GAME_THRESHOLDS[sport] || 7;
            // MLB special: only consider "close" in late innings
            if (sport === 'mlb') {
              const inning = parseInt(period) || 0;
              return inning >= 7 && scoreDiff <= closeThreshold;
            }
            return scoreDiff <= closeThreshold;
          case 'overtime':
            const otIndicators = ['OT', 'overtime', 'extra', 'ET', 'SO', 'shootout'];
            return otIndicators.some(ind => 
              period.toLowerCase().includes(ind.toLowerCase())
            );
          default:
            return false;
        }
      });
      if (!matchesGameState) return false;
    }

    // Performance Filters (OR logic within category)
    if (filters.performance.length > 0) {
      const matchesPerformance = filters.performance.some(filter => {
        switch (filter) {
          case 'high_scoring':
            const highThreshold = HIGH_SCORING_THRESHOLDS[sport] || 50;
            return totalScore >= highThreshold;
          case 'low_scoring':
            const lowThreshold = LOW_SCORING_THRESHOLDS[sport] || 20;
            return totalScore <= lowThreshold && isLive;
          case 'upset_watch':
            // Check if underdog is leading
            return game.underdogLeading === true || 
              (game.isUnderdog && awayScore > homeScore);
          case 'blowout_watch':
            const blowoutThreshold = BLOWOUT_THRESHOLDS[sport] || 15;
            return scoreDiff >= blowoutThreshold;
          default:
            return false;
        }
      });
      if (!matchesPerformance) return false;
    }

    // Odds Filters (OR logic within category)
    if (filters.odds.length > 0) {
      const matchesOdds = filters.odds.some(filter => {
        if (!game.odds) return false;
        switch (filter) {
          case 'significant_line_move':
            if (game.odds.openingSpread !== undefined && game.odds.currentSpread !== undefined) {
              const move = Math.abs(game.odds.currentSpread - game.odds.openingSpread);
              return move >= (filters.lineMovementThreshold / 10); // threshold is percentage * 10
            }
            return false;
          case 'high_total_movement':
            return (game.odds.totalMovement || 0) >= 2;
          case 'moneyline_swing':
            return (game.odds.moneylineSwing || 0) >= 50;
          default:
            return false;
        }
      });
      if (!matchesOdds) return false;
    }

    return true;
  });
}

// =====================================================
// COMPONENT
// =====================================================

interface AdvancedFiltersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  hasOddsData?: boolean;
  variant?: 'slide' | 'dropdown';
}

export function AdvancedFiltersPanel({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  hasOddsData = false,
  variant = 'slide',
}: AdvancedFiltersPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    gameState: true,
    performance: true,
    odds: true,
  });

  const activeFilterCount = 
    filters.gameState.length + 
    filters.performance.length + 
    filters.odds.length;

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleGameStateFilter = (filter: GameStateFilter) => {
    const current = filters.gameState;
    const updated = current.includes(filter)
      ? current.filter(f => f !== filter)
      : [...current, filter];
    onFiltersChange({ ...filters, gameState: updated });
  };

  const togglePerformanceFilter = (filter: PerformanceFilter) => {
    const current = filters.performance;
    const updated = current.includes(filter)
      ? current.filter(f => f !== filter)
      : [...current, filter];
    onFiltersChange({ ...filters, performance: updated });
  };

  const toggleOddsFilter = (filter: OddsFilter) => {
    const current = filters.odds;
    const updated = current.includes(filter)
      ? current.filter(f => f !== filter)
      : [...current, filter];
    onFiltersChange({ ...filters, odds: updated });
  };

  const resetFilters = () => {
    onFiltersChange(DEFAULT_FILTERS);
  };

  if (!isOpen) return null;

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-violet-400" />
          <h3 className="font-semibold text-lg">Advanced Filters</h3>
          {activeFilterCount > 0 && (
            <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 text-xs text-slate-400 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Game State Filters */}
        <FilterSection
          title="Game State"
          icon={<Clock className="h-4 w-4 text-blue-400" />}
          isExpanded={expandedSections.gameState}
          onToggle={() => toggleSection('gameState')}
          activeCount={filters.gameState.length}
        >
          <div className="grid grid-cols-2 gap-2">
            <FilterChip
              label="Live Only"
              icon={<Zap className="h-3.5 w-3.5" />}
              isActive={filters.gameState.includes('live_only')}
              onClick={() => toggleGameStateFilter('live_only')}
            />
            <FilterChip
              label="Upcoming"
              icon={<Clock className="h-3.5 w-3.5" />}
              isActive={filters.gameState.includes('upcoming_only')}
              onClick={() => toggleGameStateFilter('upcoming_only')}
            />
            <FilterChip
              label="Close Games"
              icon={<Target className="h-3.5 w-3.5" />}
              isActive={filters.gameState.includes('close_games')}
              onClick={() => toggleGameStateFilter('close_games')}
              tooltip="NFL: ≤7pts, NBA: ≤6pts, MLB: ≤1 run (7th+)"
            />
            <FilterChip
              label="Overtime"
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              isActive={filters.gameState.includes('overtime')}
              onClick={() => toggleGameStateFilter('overtime')}
            />
          </div>
        </FilterSection>

        {/* Performance Filters */}
        <FilterSection
          title="Performance"
          icon={<Activity className="h-4 w-4 text-emerald-400" />}
          isExpanded={expandedSections.performance}
          onToggle={() => toggleSection('performance')}
          activeCount={filters.performance.length}
        >
          <div className="grid grid-cols-2 gap-2">
            <FilterChip
              label="High Scoring"
              icon={<Trophy className="h-3.5 w-3.5" />}
              isActive={filters.performance.includes('high_scoring')}
              onClick={() => togglePerformanceFilter('high_scoring')}
              tooltip="Above average combined score"
            />
            <FilterChip
              label="Defensive Battle"
              icon={<Shield className="h-3.5 w-3.5" />}
              isActive={filters.performance.includes('low_scoring')}
              onClick={() => togglePerformanceFilter('low_scoring')}
              tooltip="Below average combined score"
            />
            <FilterChip
              label="Upset Watch"
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              isActive={filters.performance.includes('upset_watch')}
              onClick={() => togglePerformanceFilter('upset_watch')}
              tooltip="Underdog currently leading"
            />
            <FilterChip
              label="Blowout"
              icon={<Zap className="h-3.5 w-3.5" />}
              isActive={filters.performance.includes('blowout_watch')}
              onClick={() => togglePerformanceFilter('blowout_watch')}
              tooltip="Large margin games"
            />
          </div>
        </FilterSection>

        {/* Odds Movement Filters */}
        {hasOddsData && (
          <FilterSection
            title="Odds Movement"
            icon={<TrendingUp className="h-4 w-4 text-amber-400" />}
            isExpanded={expandedSections.odds}
            onToggle={() => toggleSection('odds')}
            activeCount={filters.odds.length}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2">
                <FilterChip
                  label="Significant Line Move"
                  isActive={filters.odds.includes('significant_line_move')}
                  onClick={() => toggleOddsFilter('significant_line_move')}
                  tooltip={`Line moved ≥${filters.lineMovementThreshold / 10} pts`}
                />
                <FilterChip
                  label="High Total Movement"
                  isActive={filters.odds.includes('high_total_movement')}
                  onClick={() => toggleOddsFilter('high_total_movement')}
                  tooltip="O/U moved ≥2 points"
                />
                <FilterChip
                  label="Moneyline Swing"
                  isActive={filters.odds.includes('moneyline_swing')}
                  onClick={() => toggleOddsFilter('moneyline_swing')}
                  tooltip="Significant moneyline movement"
                />
              </div>
              
              {/* Threshold Slider */}
              {filters.odds.includes('significant_line_move') && (
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Movement Threshold</span>
                    <span className="font-mono text-violet-400">
                      {(filters.lineMovementThreshold / 10).toFixed(1)} pts
                    </span>
                  </div>
                  <Slider
                    value={[filters.lineMovementThreshold]}
                    onValueChange={([value]) => 
                      onFiltersChange({ ...filters, lineMovementThreshold: value })
                    }
                    min={5}
                    max={30}
                    step={5}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </FilterSection>
        )}

        {/* Sport-Aware Hints */}
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="text-violet-400 font-medium">Sport-aware:</span> "Close games" adapts to each sport — 
            NFL within 7pts, NBA within 6pts, MLB within 1 run in 7th+, Soccer within 1 goal.
          </p>
        </div>
      </div>
    </div>
  );

  // Slide-out panel variant
  if (variant === 'slide') {
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
        {/* Panel */}
        <div className={cn(
          "fixed right-0 top-0 bottom-0 w-80 z-50",
          "bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/50",
          "shadow-2xl shadow-black/50",
          "animate-in slide-in-from-right duration-200"
        )}>
          {content}
        </div>
      </>
    );
  }

  // Dropdown variant
  return (
    <div className={cn(
      "absolute right-0 top-full mt-2 w-80 z-50",
      "bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50",
      "shadow-2xl shadow-black/50",
      "animate-in fade-in zoom-in-95 duration-150"
    )}>
      {content}
    </div>
  );
}

// =====================================================
// SUB-COMPONENTS
// =====================================================

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  activeCount: number;
  children: React.ReactNode;
}

function FilterSection({ 
  title, 
  icon, 
  isExpanded, 
  onToggle, 
  activeCount,
  children 
}: FilterSectionProps) {
  return (
    <div className="rounded-lg bg-slate-800/30 border border-slate-700/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
          {activeCount > 0 && (
            <Badge className="h-5 px-1.5 bg-violet-500/20 text-violet-300 border-violet-500/30 text-xs">
              {activeCount}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {isExpanded && (
        <div className="p-3 pt-0">
          {children}
        </div>
      )}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  icon?: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  tooltip?: string;
}

function FilterChip({ label, icon, isActive, onClick, tooltip }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
        "border",
        isActive
          ? "bg-violet-500/20 text-violet-300 border-violet-500/50"
          : "bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// =====================================================
// FILTER BUTTON (for triggering the panel)
// =====================================================

interface AdvancedFiltersButtonProps {
  onClick: () => void;
  activeCount: number;
  className?: string;
}

export function AdvancedFiltersButton({ 
  onClick, 
  activeCount,
  className 
}: AdvancedFiltersButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-8 gap-2",
        activeCount > 0 && "border-violet-500/50 text-violet-300",
        className
      )}
    >
      <Filter className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Filters</span>
      {activeCount > 0 && (
        <Badge className="h-4 px-1 min-w-[16px] bg-violet-500 text-white text-[10px]">
          {activeCount}
        </Badge>
      )}
    </Button>
  );
}
