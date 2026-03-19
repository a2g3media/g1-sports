/**
 * Lines Center - Super Alive Odds Hub
 * Uses unified scoreboard API with ScoreCard component
 * Expandable rows for props and line movement analysis
 * Smart fallback when selected sport has no games
 */

import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ChevronDown, ChevronUp, Activity, 
  AlertCircle, Loader2, Radio, BarChart3
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { toGameDetailPath } from "@/react-app/lib/gameRoutes";
import { useDocumentTitle } from "@/react-app/hooks/useDocumentTitle";
import { Skeleton } from "@/react-app/components/ui/skeleton";
import { ApprovedScoreCard, ApprovedScoreCardGame } from "@/react-app/components/ApprovedScoreCard";
import { LineHistoryChart } from "@/react-app/components/LineHistoryChart";
import { CompactLineMovement } from "@/react-app/components/CompactLineMovement";
import { BettingTrendsCard } from "@/react-app/components/BettingTrendsCard";
import { OddsComparisonTable } from "@/react-app/components/OddsComparisonTable";
import { LineMovementStrip } from "@/react-app/components/LineMovementAlerts";
import { 
  useScoreboard, 
  AVAILABLE_SPORTS, 
  SportKey, 
  DateRange 
} from "@/react-app/hooks/useScoreboard";
import {
  RefreshStatus,
  FallbackBanner,
  Toast,
  useToast,
  PremiumEmptyState,
  LiveBadge,
  SectionHeader,
} from "@/react-app/components/AliveIndicators";

// Helper to safely extract team abbreviation from union type
function getTeamAbbr(team: string | { abbr: string; name?: string }): string {
  return typeof team === 'string' ? team : team.abbr;
}

// ============================================
// TYPES
// ============================================

interface TrendsData {
  lineHistory: Array<{
    timestamp: string;
    spread: number;
    total: number;
    mlHome: number;
    mlAway: number;
  }>;
  current?: {
    spread: number;
    total: number;
    mlHome: number;
    mlAway: number;
    openSpread?: number;
    openTotal?: number;
  };
  trends: {
    spreadMovement: { direction: string; points: number };
    totalMovement: { direction: string; points: number };
    publicBetting: {
      spreadHome: number;
      spreadAway: number;
      totalOver: number;
      totalUnder: number;
      mlHome: number;
      mlAway: number;
    };
    sharpAction: {
      indicator: 'home' | 'away' | 'over' | 'under' | 'none';
      confidence: 'low' | 'medium' | 'high';
      note: string;
    };
  };
}

interface PlayerProp {
  id: number;
  player_name: string;
  team: string | null;
  prop_type: string;
  line_value: number;
  open_line_value: number | null;
  movement: number | null;
  last_updated: string | null;
}

// ============================================
// CONSTANTS
// ============================================

const PROP_TYPE_LABELS: Record<string, string> = {
  PASSING_YARDS: 'Pass Yds',
  PASSING_TDS: 'Pass TDs',
  RUSHING_YARDS: 'Rush Yds',
  RECEIVING_YARDS: 'Rec Yds',
  RECEPTIONS: 'Receptions',
  POINTS: 'Points',
  REBOUNDS: 'Rebounds',
  ASSISTS: 'Assists',
  STEALS: 'Steals',
  BLOCKS: 'Blocks',
  THREES: '3-Pointers',
};

const STORAGE_KEYS = {
  sport: 'gz_lines_sport',
  view: 'gz_lines_view',
};

// ============================================
// HELPERS
// ============================================

function getStoredValue(key: string, defaultValue: string): string {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStoredValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// ============================================
// SUB-COMPONENTS
// ============================================

const SportPill = memo(function SportPill({ 
  sport, 
  active, 
  onClick 
}: { 
  sport: typeof AVAILABLE_SPORTS[number]; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!sport.available}
      title={!sport.available ? `${sport.label} data unavailable` : undefined}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200",
        "whitespace-nowrap shrink-0",
        !sport.available && "opacity-40 cursor-not-allowed",
        sport.available && active 
          ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-500/25" 
          : sport.available 
            ? "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80"
            : "bg-white/[0.02] text-white/30"
      )}
    >
      <span>{sport.emoji}</span>
      <span>{sport.label}</span>
    </button>
  );
});

const ViewToggle = memo(function ViewToggle({ 
  active, 
  onChange,
  liveCount
}: { 
  active: DateRange; 
  onChange: (view: DateRange) => void;
  liveCount: number;
}) {
  return (
    <div className="inline-flex gap-1 p-1 bg-[hsl(220,18%,8%)] rounded-xl border border-white/5">
      <button
        onClick={() => onChange('live')}
        className={cn(
          "px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2",
          active === 'live' 
            ? "bg-gradient-to-r from-red-600/80 to-red-700/80 text-white shadow-lg shadow-red-500/20" 
            : "text-white/50 hover:text-white/70"
        )}
      >
        <Radio className="w-3.5 h-3.5" />
        Live
        {liveCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-bold">
            {liveCount}
          </span>
        )}
      </button>
      <button
        onClick={() => onChange('today')}
        className={cn(
          "px-4 py-2 rounded-lg text-xs font-semibold transition-all",
          active === 'today' 
            ? "bg-[hsl(220,18%,16%)] text-white shadow-lg" 
            : "text-white/50 hover:text-white/70"
        )}
      >
        Today
      </button>
      <button
        onClick={() => onChange('week')}
        className={cn(
          "px-4 py-2 rounded-lg text-xs font-semibold transition-all",
          active === 'week' 
            ? "bg-[hsl(220,18%,16%)] text-white shadow-lg" 
            : "text-white/50 hover:text-white/70"
        )}
      >
        This Week
      </button>
      <button
        onClick={() => onChange('recent')}
        className={cn(
          "px-4 py-2 rounded-lg text-xs font-semibold transition-all",
          active === 'recent' 
            ? "bg-gradient-to-r from-emerald-600/80 to-emerald-700/80 text-white shadow-lg shadow-emerald-500/20" 
            : "text-white/50 hover:text-white/70"
        )}
      >
        Recent
      </button>
    </div>
  );
});

// Expanded Game Panel - Props and Movement tabs
const ExpandedGamePanel = memo(function ExpandedGamePanel({
  game,
  trendsData,
  trendsLoading,
  propsData,
  propsLoading,
}: {
  game: ApprovedScoreCardGame;
  trendsData: TrendsData | null;
  trendsLoading: boolean;
  propsData: PlayerProp[];
  propsLoading: boolean;
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'props' | 'movement'>('overview');

  const topProps = useMemo(() => {
    return propsData
      .sort((a, b) => Math.abs(b.movement || 0) - Math.abs(a.movement || 0))
      .slice(0, 5);
  }, [propsData]);

  // Coach G insight
  const coachGInsight = useMemo(() => {
    if (!trendsData) return null;
    const { spreadMovement, totalMovement, sharpAction } = trendsData.trends;
    const parts: string[] = [];
    
    if (spreadMovement.points > 0) {
      const dir = spreadMovement.direction === 'toward_home' ? getTeamAbbr(game.homeTeam) : getTeamAbbr(game.awayTeam);
      parts.push(`Line moved ${spreadMovement.points.toFixed(1)} pts toward ${dir}.`);
    }
    if (totalMovement.points > 0) {
      parts.push(`Total ${totalMovement.direction === 'over' ? 'up' : 'down'} ${totalMovement.points.toFixed(1)}.`);
    }
    if (sharpAction.indicator !== 'none') {
      parts.push(sharpAction.note);
    }
    return parts.length > 0 ? parts.slice(0, 2).join(' ') : 'Lines stable. Market quiet.';
  }, [trendsData, game]);

  return (
    <div className="mt-2 rounded-xl bg-slate-800/50 backdrop-blur-md border border-white/10 overflow-hidden">
      {/* Coach G Insight Bar */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-blue-500/[0.08] to-transparent border-b border-white/5">
        <div className="flex items-center gap-2">
          <img 
            src="/assets/coachg/coach-g-avatar.png"
            alt="Coach G"
            className="w-6 h-6 rounded-full border border-blue-500/30"
          />
          <p className="text-xs text-white/70 flex-1">
            {trendsLoading ? (
              <span className="text-white/40">Analyzing market...</span>
            ) : coachGInsight || 'No market data available.'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5">
        {(['overview', 'props', 'movement'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              activeTab === tab
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white/70"
            )}
          >
            {tab === 'overview' && 'Overview'}
            {tab === 'props' && `Props${propsData.length > 0 ? ` (${propsData.length})` : ''}`}
            {tab === 'movement' && 'Movement'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-white/[0.03] rounded-lg odds-shimmer">
                <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-1">Open Spread</span>
                <span className="text-sm font-semibold text-white/70">
                  {game.odds?.openSpread !== undefined && game.odds?.openSpread !== null
                    ? (game.odds.openSpread > 0 ? `+${game.odds.openSpread}` : game.odds.openSpread)
                    : '—'}
                </span>
              </div>
              <div className="p-3 bg-white/[0.03] rounded-lg odds-shimmer">
                <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-1">Current Spread</span>
                <span className="text-sm font-semibold text-white">
                  {game.odds?.spread !== undefined && game.odds?.spread !== null
                    ? (game.odds.spread > 0 ? `+${game.odds.spread}` : game.odds.spread)
                    : '—'}
                </span>
              </div>
              <div className="p-3 bg-white/[0.03] rounded-lg odds-shimmer">
                <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-1">Open Total</span>
                <span className="text-sm font-semibold text-white/70">
                  {game.odds?.openTotal ?? '—'}
                </span>
              </div>
              <div className="p-3 bg-white/[0.03] rounded-lg odds-shimmer">
                <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-1">Current Total</span>
                <span className="text-sm font-semibold text-white">
                  {game.odds?.total ?? '—'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/50">
              <span>Status: <span className="text-white/70 capitalize">{game.status}</span></span>
              <span>Start: <span className="text-white/70">{game.startTime ? new Date(game.startTime).toLocaleString() : '—'}</span></span>
            </div>
            
            {/* Compact Line Movement */}
            {game.gameId && (
              <CompactLineMovement 
                gameId={game.gameId} 
                className="mt-3 pt-3 border-t border-white/5" 
              />
            )}
          </div>
        )}

        {/* Props Tab */}
        {activeTab === 'props' && (
          <div className="space-y-3">
            {propsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              </div>
            ) : topProps.length === 0 ? (
              <div className="text-center py-6">
                <Activity className="w-6 h-6 text-white/20 mx-auto mb-2" />
                <p className="text-xs text-white/40">No props available yet</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {topProps.map((prop) => (
                    <div 
                      key={prop.id}
                      className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-lg"
                    >
                      <div>
                        <span className="text-sm text-white font-medium">{prop.player_name}</span>
                        <span className="text-xs text-white/40 ml-2">{prop.team}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-white/50">
                          {PROP_TYPE_LABELS[prop.prop_type] || prop.prop_type}
                        </span>
                        <span className="text-sm font-semibold text-white">{prop.line_value}</span>
                        {prop.movement !== null && prop.movement !== 0 && (
                          <span className={cn(
                            "text-xs animate-line-move",
                            prop.movement > 0 ? "text-emerald-400" : "text-red-400"
                          )}>
                            {prop.movement > 0 ? '+' : ''}{prop.movement}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(toGameDetailPath(game.sport?.toLowerCase() || 'nba', game.gameId))}
                    className="flex-1 py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Full Game Detail →
                  </button>
                  <button
                    onClick={() => navigate(`/lines/${game.gameId}/props`)}
                    className="flex-1 py-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    View All Props →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Movement Tab */}
        {activeTab === 'movement' && (
          <div className="space-y-4">
            {trendsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              </div>
            ) : !trendsData || trendsData.lineHistory.length === 0 ? (
              <div className="text-center py-6">
                <Activity className="w-6 h-6 text-white/20 mx-auto mb-2" />
                <p className="text-xs text-white/40">Movement history will appear as lines update.</p>
              </div>
            ) : (
              <>
                <LineHistoryChart
                  data={trendsData.lineHistory}
                  openSpread={trendsData.current?.openSpread}
                  openTotal={trendsData.current?.openTotal}
                  homeTeam={getTeamAbbr(game.homeTeam)}
                  awayTeam={getTeamAbbr(game.awayTeam)}
                />
                <BettingTrendsCard
                  publicBetting={trendsData.trends.publicBetting}
                  sharpAction={trendsData.trends.sharpAction}
                  spreadMovement={trendsData.trends.spreadMovement}
                  totalMovement={trendsData.trends.totalMovement}
                  homeTeam={getTeamAbbr(game.homeTeam)}
                  awayTeam={getTeamAbbr(game.awayTeam)}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// Game Row with ApprovedScoreCard + expand/collapse
const GameRow = memo(function GameRow({
  game,
  isExpanded,
  onToggle,
  trendsData,
  trendsLoading,
  propsData,
  propsLoading,
}: {
  game: ApprovedScoreCardGame;
  isExpanded: boolean;
  onToggle: () => void;
  trendsData: TrendsData | null;
  trendsLoading: boolean;
  propsData: PlayerProp[];
  propsLoading: boolean;
}) {
  return (
    <div className="space-y-0">
      {/* Game Card with expand button */}
      <div className="relative group">
        <ApprovedScoreCard 
          game={game} 
          onClick={onToggle}
        />
        
        {/* Expand indicator */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={cn(
            "absolute bottom-4 right-4 p-1.5 rounded-lg transition-all z-10",
            "bg-white/10 hover:bg-white/15 text-white/50 hover:text-white/80",
            isExpanded && "bg-white/15 text-white/80"
          )}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Expanded Panel */}
      {isExpanded && (
        <ExpandedGamePanel
          game={game}
          trendsData={trendsData}
          trendsLoading={trendsLoading}
          propsData={propsData}
          propsLoading={propsLoading}
        />
      )}
    </div>
  );
});

// Loading skeleton
function LinesSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} className="h-64 w-full rounded-2xl bg-white/5" />
      ))}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function LinesCenter() {
  useDocumentTitle('Lines Center');
  const { toast, showToast, hideToast } = useToast();
  
  const validSports = AVAILABLE_SPORTS.filter(s => s.available).map(s => s.key) as SportKey[];
  
  const [sport, setSport] = useState<SportKey>(() => {
    const stored = getStoredValue(STORAGE_KEYS.sport, 'NBA').toUpperCase() as SportKey;
    return validSports.includes(stored) ? stored : 'NFL';
  });
  const [view, setView] = useState<DateRange>(() => {
    const stored = getStoredValue(STORAGE_KEYS.view, 'recent') as DateRange;
    return ['live', 'today', 'week', 'recent'].includes(stored) ? stored : 'recent';
  });
  const [displayMode, setDisplayMode] = useState<'games' | 'compare'>('games');
  const [showFallbackBanner, setShowFallbackBanner] = useState(true);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  
  // Cache for trends and props data
  const [trendsCache, setTrendsCache] = useState<Record<string, TrendsData>>({});
  const [trendsLoading, setTrendsLoading] = useState<string | null>(null);
  const [propsCache, setPropsCache] = useState<Record<string, PlayerProp[]>>({});
  const [propsLoading, setPropsLoading] = useState<string | null>(null);
  
  // Stable callback ref to prevent infinite re-renders
  const sportFallbackRef = useRef<((from: SportKey, to: SportKey) => void) | undefined>(undefined);
  sportFallbackRef.current = (from: SportKey, to: SportKey) => {
    setShowFallbackBanner(true);
    console.log(`Lines: Fallback from ${from} to ${to}`);
  };
  
  const handleSportFallback = useCallback((from: SportKey, to: SportKey) => {
    sportFallbackRef.current?.(from, to);
  }, []);

  // Use the scoreboard hook with smart fallback - using stable callback
  const {
    games,
    liveGames,
    scheduledGames,
    finalGames,
    loading,
    refreshing,
    error,
    lastFetchAt,
    fallbackMessage,
    activeSport,
    refresh,
    clearFallbackMessage,
  } = useScoreboard({
    sport,
    range: view,
    autoRefresh: view === 'live',
    autoRefreshInterval: 30000,
    enableFallback: true,
    onSportFallback: handleSportFallback,
  });

  // Persist selections
  useEffect(() => {
    setStoredValue(STORAGE_KEYS.sport, sport);
  }, [sport]);

  useEffect(() => {
    setStoredValue(STORAGE_KEYS.view, view);
  }, [view]);

  // Collapse expanded game when switching
  useEffect(() => {
    setExpandedGameId(null);
    setShowFallbackBanner(true);
    clearFallbackMessage();
  }, [sport, view, clearFallbackMessage]);

  // Fetch trends when game expanded
  const fetchTrends = useCallback(async (gameId: string) => {
    if (trendsCache[gameId]) return;
    setTrendsLoading(gameId);
    try {
      const res = await fetch(`/api/sports-data/trends/${gameId}`);
      if (res.ok) {
        const data = await res.json();
        setTrendsCache(prev => ({ ...prev, [gameId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch trends:', err);
    } finally {
      setTrendsLoading(null);
    }
  }, [trendsCache]);

  // Fetch props when game expanded
  const fetchProps = useCallback(async (gameId: string) => {
    if (propsCache[gameId]) return;
    setPropsLoading(gameId);
    try {
      const res = await fetch(`/api/sports-data/props/${gameId}`);
      if (res.ok) {
        const data = await res.json();
        setPropsCache(prev => ({ ...prev, [gameId]: data.props || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch props:', err);
    } finally {
      setPropsLoading(null);
    }
  }, [propsCache]);

  // Handle game expansion
  const handleToggleGame = useCallback((gameId: string) => {
    if (expandedGameId === gameId) {
      setExpandedGameId(null);
    } else {
      setExpandedGameId(gameId);
      fetchTrends(gameId);
      fetchProps(gameId);
    }
  }, [expandedGameId, fetchTrends, fetchProps]);

  const handleSportChange = useCallback((newSport: SportKey) => {
    setSport(newSport);
  }, []);

  const handleViewChange = useCallback((newView: DateRange) => {
    setView(newView);
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      await refresh();
    } catch {
      showToast('Update failed — retry', 'error');
    }
  }, [refresh, showToast]);

  const allSportsEmpty = games.length === 0 && !loading && !error;

  return (
    <div className="min-h-screen pb-24 -mx-4 -mt-4">
      {/* Cinematic background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,7%)] via-[hsl(220,20%,5%)] to-[hsl(220,25%,4%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05),transparent_60%)]" />
        {liveGames.length > 0 && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(239,68,68,0.04),transparent_50%)]" />
        )}
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">Lines Center</h1>
                {liveGames.length > 0 && <LiveBadge count={liveGames.length} />}
              </div>
              <p className="text-xs text-white/40 mt-0.5">
                Informational only • No wagering
              </p>
            </div>
            <RefreshStatus
              lastFetchAt={lastFetchAt}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          </div>
        </div>

        {/* Sport Pills */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {AVAILABLE_SPORTS.map((s) => (
              <SportPill
                key={s.key}
                sport={s}
                active={sport === s.key || activeSport === s.key}
                onClick={() => s.available && handleSportChange(s.key as SportKey)}
              />
            ))}
          </div>
        </div>

        {/* View Controls */}
        <div className="px-4 pb-4 flex items-center justify-between gap-3">
          <ViewToggle active={view} onChange={handleViewChange} liveCount={liveGames.length} />
          
          {/* Display Mode Toggle */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setDisplayMode('games')}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                displayMode === 'games'
                  ? "bg-emerald-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Radio className="w-3.5 h-3.5" />
              Games
            </button>
            <button
              onClick={() => setDisplayMode('compare')}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                displayMode === 'compare'
                  ? "bg-emerald-600 text-white shadow"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Compare
            </button>
          </div>
        </div>

        {/* Line Movement Alerts Strip */}
        <div className="px-4 pb-3">
          <LineMovementStrip sport={sport} />
        </div>

        {/* Fallback Banner */}
        {fallbackMessage && showFallbackBanner && (
          <FallbackBanner
            message={fallbackMessage}
            onDismiss={() => setShowFallbackBanner(false)}
            onShowOriginal={() => {
              clearFallbackMessage();
              setShowFallbackBanner(false);
            }}
            originalSport={AVAILABLE_SPORTS.find(s => s.key === sport)?.label}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="px-4">
            <LinesSkeleton />
          </div>
        ) : error ? (
          <div className="px-4 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-amber-500/50" />
            </div>
            <p className="text-sm text-white/40 mb-4">{error}</p>
            <button 
              onClick={handleRefresh}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-semibold rounded-lg shadow-lg shadow-emerald-500/20"
            >
              Try Again
            </button>
          </div>
        ) : allSportsEmpty ? (
          <PremiumEmptyState
            currentRange={view}
            onRangeChange={handleViewChange}
            onSportChange={handleSportChange}
            sport={sport}
          />
        ) : displayMode === 'compare' ? (
          <div className="px-4">
            <OddsComparisonTable sport={sport} />
          </div>
        ) : (
          <div className="space-y-8 px-4">
            {/* Live Games */}
            {liveGames.length > 0 && (
              <section>
                <SectionHeader title="Live Now" count={liveGames.length} variant="live" />
                <div className="space-y-4">
                  {liveGames.map(game => (
                    <GameRow
                      key={game.gameId}
                      game={game}
                      isExpanded={expandedGameId === game.gameId}
                      onToggle={() => handleToggleGame(game.gameId || game.id)}
                      trendsData={trendsCache[game.gameId || game.id] || null}
                      trendsLoading={trendsLoading === (game.gameId || game.id)}
                      propsData={propsCache[game.gameId || game.id] || []}
                      propsLoading={propsLoading === (game.gameId || game.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Scheduled Games */}
            {scheduledGames.length > 0 && (
              <section>
                <SectionHeader title="Upcoming" count={scheduledGames.length} variant="upcoming" />
                <div className="space-y-4">
                  {scheduledGames.map(game => (
                    <GameRow
                      key={game.gameId}
                      game={game}
                      isExpanded={expandedGameId === game.gameId}
                      onToggle={() => handleToggleGame(game.gameId || game.id)}
                      trendsData={trendsCache[game.gameId || game.id] || null}
                      trendsLoading={trendsLoading === (game.gameId || game.id)}
                      propsData={propsCache[game.gameId || game.id] || []}
                      propsLoading={propsLoading === (game.gameId || game.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Final Games */}
            {finalGames.length > 0 && (
              <section>
                <SectionHeader title="Final" count={finalGames.length} variant="final" />
                <div className="space-y-4">
                  {finalGames.map(game => (
                    <GameRow
                      key={game.gameId}
                      game={game}
                      isExpanded={expandedGameId === game.gameId}
                      onToggle={() => handleToggleGame(game.gameId || game.id)}
                      trendsData={trendsCache[game.gameId || game.id] || null}
                      trendsLoading={trendsLoading === (game.gameId || game.id)}
                      propsData={propsCache[game.gameId || game.id] || []}
                      propsLoading={propsLoading === (game.gameId || game.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={hideToast}
          onRetry={toast.type === 'error' ? handleRefresh : undefined}
        />
      )}
    </div>
  );
}

export default LinesCenter;
