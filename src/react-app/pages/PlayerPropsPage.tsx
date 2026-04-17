/**
 * PlayerPropsPage - Premium Player Props Experience
 * 
 * Route: /props
 * ESPN-style player prop cards with sportsbook comparison,
 * search/filters, and Coach G integration.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Search, X, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Target, Lock, Plus, Star,
  Send, Sparkles, Check
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useProviderCapabilities } from "@/react-app/hooks/useProviderCapabilities";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { useWatchboards } from "@/react-app/hooks/useWatchboards";
import { AddPropToWatchboardModal } from "@/react-app/components/AddPropToWatchboardModal";
import { PlayerPhoto } from "@/react-app/components/PlayerPhoto";
import { useFavoriteSports } from "@/react-app/components/FavoriteSportsSelector";
import { fetchJsonCached, getFetchCacheStats } from "@/react-app/lib/fetchCache";
import { getRouteCache, setRouteCache } from "@/react-app/lib/routeDataCache";
import { incrementPerfCounter, logPerfSnapshot, startPerfTimer } from "@/react-app/lib/perfTelemetry";
import { canonicalPlayerIdQueryParam, logPlayerNavigation } from "@/react-app/lib/navigationRoutes";
import { navigateToPlayerProfile } from "@/react-app/lib/playerProfileNavigation";
import {
  dispatchWorkerPrewarmForPropsFeed,
  prewarmPropsFeedSnapshots,
} from "@/react-app/lib/propsPageSnapshotGate";
import { prefetchFullPlayerProfileSnapshot } from "@/react-app/lib/playerProfileSnapshotPrewarm";
import { usePlayerProfileInViewPrewarm } from "@/react-app/hooks/usePlayerProfileInViewPrewarm";
import { resolvePlayerIdForNavigation } from "@/react-app/lib/resolvePlayerIdForNavigation";

// ============================================
// TYPES
// ============================================

interface PlayerProp {
  id: number;
  game_id: string;
  player_name: string;
  player_id?: string;
  team: string | null;
  sport: string;
  prop_type: string;
  line_value: number;
  open_line_value: number | null;
  movement: number | null;
  last_updated: string | null;
  home_team?: string;
  away_team?: string;
  sportsbook?: string;
  odds_american?: number | null;
}

interface GroupedProp {
  playerName: string;
  playerId?: string;
  team: string;
  sport: string;
  props: PlayerProp[];
}

interface PropIntelSnapshot {
  l5Pct: number | null;
  l5Hits: number;
  l5Total: number;
  seasonPct: number | null;
  seasonHits: number;
  seasonTotal: number;
  h2hPct: number | null;
  h2hWins: number;
  h2hTotal: number;
}

// ============================================
// CONSTANTS
// ============================================

const SPORTS = [
  { key: 'ALL', label: 'All', icon: '🏆' },
  { key: 'NBA', label: 'NBA', icon: '🏀' },
  { key: 'NFL', label: 'NFL', icon: '🏈' },
  { key: 'MLB', label: 'MLB', icon: '⚾' },
  { key: 'NHL', label: 'NHL', icon: '🏒' },
  { key: 'NCAAB', label: 'NCAAB', icon: '🏀' },
] as const;

const PROP_CATEGORIES = {
  NBA: ['POINTS', 'REBOUNDS', 'ASSISTS', 'THREES', 'PRA', 'STEALS', 'BLOCKS'],
  NFL: ['PASSING_YARDS', 'RUSHING_YARDS', 'RECEIVING_YARDS', 'PASSING_TDS', 'RECEPTIONS'],
  MLB: ['HITS', 'RUNS', 'RBIS', 'STRIKEOUTS', 'HOME_RUNS', 'TOTAL_BASES'],
  NHL: ['GOALS', 'ASSISTS', 'SHOTS', 'SAVES', 'POINTS_NHL'],
  NCAAB: ['POINTS', 'REBOUNDS', 'ASSISTS', 'THREES'],
  ALL: ['POINTS', 'REBOUNDS', 'ASSISTS', 'THREES', 'PRA', 'PASSING_YARDS', 'RUSHING_YARDS']
} as const;

const PROP_TYPE_LABELS: Record<string, string> = {
  POINTS: 'Points',
  REBOUNDS: 'Rebounds',
  ASSISTS: 'Assists',
  STEALS: 'Steals',
  BLOCKS: 'Blocks',
  THREES: '3-Pointers',
  PRA: 'PTS+REB+AST',
  PR: 'PTS+REB',
  PA: 'PTS+AST',
  RA: 'REB+AST',
  SB: 'STL+BLK',
  TURNOVERS: 'Turnovers',
  DOUBLE_DOUBLE: 'Double-Double',
  TRIPLE_DOUBLE: 'Triple-Double',
  PASSING_YARDS: 'Pass Yards',
  PASSING_TDS: 'Pass TDs',
  RUSHING_YARDS: 'Rush Yards',
  RECEIVING_YARDS: 'Rec Yards',
  RECEPTIONS: 'Receptions',
  INTERCEPTIONS: 'INTs',
  HITS: 'Hits',
  RUNS: 'Runs',
  RBIS: 'RBIs',
  STRIKEOUTS: 'Strikeouts',
  HOME_RUNS: 'Home Runs',
  TOTAL_BASES: 'Total Bases',
  GOALS: 'Goals',
  SHOTS: 'Shots',
  SAVES: 'Saves',
  POINTS_NHL: 'Points',
  OTHER: 'Other'
};

const SPORTSBOOK_COLORS: Record<string, string> = {
  'DraftKings': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'FanDuel': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'BetMGM': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Caesars': 'bg-red-500/20 text-red-400 border-red-500/30',
  'PointsBet': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'BetRivers': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'WilliamHill': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'default': 'bg-white/10 text-white/70 border-white/20'
};

// Team colors for accents
const TEAM_COLORS: Record<string, string> = {
  // NBA Teams
  'Lakers': '#552583', 'Celtics': '#007A33', 'Warriors': '#1D428A', 'Heat': '#98002E',
  'Bulls': '#CE1141', 'Nets': '#000000', 'Knicks': '#006BB6', '76ers': '#006BB6',
  'Bucks': '#00471B', 'Suns': '#1D1160', 'Mavericks': '#00538C', 'Clippers': '#C8102E',
  // NFL Teams
  'Chiefs': '#E31837', 'Eagles': '#004C54', 'Cowboys': '#003594', 'Bills': '#00338D',
  'Ravens': '#241773', '49ers': '#AA0000', 'Dolphins': '#008E97', 'Lions': '#0076B6',
  // Default
  'default': '#3B82F6'
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Normalize player name from "Last, First" to "First Last" format
function normalizePlayerName(name: string): string {
  if (name.includes(', ')) {
    const [last, first] = name.split(', ');
    return `${first} ${last}`;
  }
  return name;
}

function normalizeFollowedPlayerKey(name: string): string {
  return normalizePlayerName(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeToken(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolvedPlayerIdForGroup(
  rawId: unknown,
  displayName: string,
  sport: string
): string {
  return (
    canonicalPlayerIdQueryParam(rawId)
    || resolvePlayerIdForNavigation(rawId, displayName, String(sport || "").toLowerCase())
    || ""
  );
}

function strictPlayerIdFromPropSource(prop: PlayerProp & Record<string, unknown>): string {
  const candidates: unknown[] = [
    prop.player_id,
    prop.playerId,
    prop.espn_id,
    prop.espnId,
    prop.athlete_id,
    prop.athleteId,
    prop.player,
  ];
  for (const candidate of candidates) {
    const parsed = canonicalPlayerIdQueryParam(candidate);
    if (parsed) return parsed;
  }
  return "";
}

function normalizePlayerToken(name: string): string {
  const normalized = normalizePlayerName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,'’`-]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

function buildPlayerProfileRouteCacheKey(sport: string, playerId?: string): string {
  const sportUpper = String(sport || "").toUpperCase();
  const id = String(playerId || "").trim();
  if (!/^\d{4,}$/.test(id)) return "";
  return `player-profile:v2:${sportUpper}:${id}`;
}

function extractProfileFromEnvelope(payload: any): any {
  if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") {
    return payload.data.profile ?? null;
  }
  return payload;
}

function hasCoreProfileDataLite(payload: any): boolean {
  if (!payload || !payload.player) return false;
  const gameLog = Array.isArray(payload.gameLog) ? payload.gameLog : [];
  const seasonAverages = payload.seasonAverages && typeof payload.seasonAverages === "object" ? payload.seasonAverages : {};
  const currentProps = Array.isArray(payload.currentProps) ? payload.currentProps : [];
  const recentPerformance = Array.isArray(payload.recentPerformance) ? payload.recentPerformance : [];
  return (
    gameLog.length > 0
    || Object.keys(seasonAverages).length > 0
    || currentProps.length > 0
    || recentPerformance.length > 0
    || Boolean(payload?.matchup?.opponent)
  );
}

function getStatKeysForPropType(propType: string): string[] {
  const t = String(propType || '').toLowerCase();
  if (t.includes('point') && !t.includes('three')) return ['PTS', 'Points'];
  if (t.includes('rebound') || t === 'reb') return ['REB', 'Rebounds', 'TRB'];
  if (t.includes('assist') || t === 'ast') return ['AST', 'Assists'];
  if (t.includes('steal')) return ['STL', 'Steals'];
  if (t.includes('block')) return ['BLK', 'Blocks'];
  if (t.includes('three') || t.includes('3pt') || t.includes('3pm')) return ['3PM', '3PT', 'FG3M'];
  if (t === 'pra' || t.includes('pts_reb_ast')) return ['PRA'];
  if (t === 'pr' || t.includes('pts_reb')) return ['PR'];
  if (t === 'pa' || t.includes('pts_ast')) return ['PA'];
  if (t === 'ra' || t.includes('reb_ast')) return ['RA'];
  return [];
}

const FOLLOWED_PLAYERS_LOCAL_KEY = 'gz_followed_players';

function getTeamColor(team: string): string {
  const key = Object.keys(TEAM_COLORS).find(k => team?.toLowerCase().includes(k.toLowerCase()));
  return TEAM_COLORS[key || 'default'];
}

function formatOdds(odds?: number | null): string {
  if (!odds) return '';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getSportsbookColor(sportsbook?: string): string {
  if (!sportsbook) return SPORTSBOOK_COLORS.default;
  const key = Object.keys(SPORTSBOOK_COLORS).find(k => 
    sportsbook.toLowerCase().includes(k.toLowerCase())
  );
  return SPORTSBOOK_COLORS[key || 'default'];
}

function getGameDisplayLabel(gameId: string, sample?: PlayerProp): string {
  const away = sample?.away_team?.trim();
  const home = sample?.home_team?.trim();
  if (away && home) return `${away} @ ${home}`;
  const shortId = gameId.length > 20 ? gameId.slice(-12) : gameId;
  return `Game ${shortId}`;
}

// ============================================
// COMPONENTS
// ============================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,6%)] via-[hsl(220,20%,8%)] to-[hsl(220,25%,4%)]" />
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/[0.03] rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/[0.02] rounded-full blur-[100px]" />
      <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-amber-500/[0.02] rounded-full blur-[80px]" />
    </div>
  );
}

function SportTab({ 
  sport, 
  active, 
  onClick 
}: { 
  sport: { key: string; label: string; icon: string }; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
        active 
          ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25" 
          : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
      )}
    >
      <span>{sport.icon}</span>
      <span>{sport.label}</span>
    </button>
  );
}

function PropTypeChip({ 
  type, 
  active, 
  onClick 
}: { 
  type: string; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap",
        active 
          ? "bg-amber-500/80 text-white" 
          : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/70"
      )}
    >
      {PROP_TYPE_LABELS[type] || type}
    </button>
  );
}

function PlayerPropCard({ 
  group,
  onQuickAdd,
  onChooseBoard,
  isFollowed,
  onToggleFollow,
  intel,
  snapshotsReady = true,
}: { 
  group: GroupedProp;
  onQuickAdd?: (prop: PlayerProp) => void;
  onChooseBoard?: (prop: PlayerProp) => void;
  isFollowed?: boolean;
  onToggleFollow?: (playerName: string) => void;
  intel?: PropIntelSnapshot | null;
  /** When false, snapshot warming is still in progress (navigation remains enabled when ID is valid). */
  snapshotsReady?: boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState(false);
  const teamColor = getTeamColor(group.team);
  const displayName = normalizePlayerName(group.playerName);
  const exactPlayerId = resolvedPlayerIdForGroup(group.playerId, displayName, group.sport);
  const canNavigate = Boolean(exactPlayerId);
  const hasPrefetchedRef = useRef(false);
  const inViewPrewarmRef = usePlayerProfileInViewPrewarm({
    sport: String(group.sport || "").toUpperCase(),
    playerId: exactPlayerId,
    displayName: normalizePlayerName(group.playerName),
  });

  const prefetchPlayerProfile = useCallback(() => {
    if (hasPrefetchedRef.current) return;
    if (!canNavigate) return;
    if (!snapshotsReady) return;
    const sportUpper = String(group.sport || "").toUpperCase();
    const playerId = exactPlayerId;
    if (!playerId) return;
    hasPrefetchedRef.current = true;
    void prefetchFullPlayerProfileSnapshot({
      sport: sportUpper,
      playerId,
      timeoutMs: 22_000,
    }).then((envelope) => {
      const profile = extractProfileFromEnvelope(envelope);
      if (!hasCoreProfileDataLite(profile)) return;
      const rk = buildPlayerProfileRouteCacheKey(sportUpper, playerId);
      if (rk) setRouteCache(rk, profile, 180_000);
    }).catch(() => {
      hasPrefetchedRef.current = false;
    });
  }, [canNavigate, exactPlayerId, group.sport, snapshotsReady]);
  
  // Navigate to player profile
  const handlePlayerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canNavigate) {
      e.preventDefault();
      return;
    }
    const pid = exactPlayerId;
    if (!pid) {
      console.error("PROPS_NAV_MISSING_PLAYER_ID", { displayName, sport: group.sport });
      return;
    }
    logPlayerNavigation(pid, group.sport);
    void navigateToPlayerProfile(navigate, String(group.sport || ""), pid, {
      displayName,
      source: "PlayerPropsCard",
    });
  };
  
  // Get the primary prop (first one, usually points for basketball)
  const primaryProp = group.props[0];
  const additionalProps = group.props.slice(1);
  
  // Group by sportsbook for comparison
  const sportsbookLines = useMemo(() => {
    const byBook: Record<string, PlayerProp[]> = {};
    group.props.forEach(p => {
      const book = p.sportsbook || 'Unknown';
      if (!byBook[book]) byBook[book] = [];
      byBook[book].push(p);
    });
    return byBook;
  }, [group.props]);
  
  const uniqueSportsbooks = Object.keys(sportsbookLines);
  
  return (
    <div
      ref={inViewPrewarmRef}
      className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.12] transition-all group"
    >
      {/* Team Color Accent Bar */}
      <div 
        className="h-1"
        style={{ background: `linear-gradient(90deg, ${teamColor}, ${teamColor}66)` }}
      />
      
      {/* Main Card Content */}
      <div className="p-4">
        <div className="flex gap-4">
          {/* Player Photo - Clickable */}
          <div
            className={cn("shrink-0", canNavigate ? "cursor-pointer" : "cursor-not-allowed opacity-60")}
            onClick={canNavigate ? handlePlayerClick : undefined}
            onMouseEnter={canNavigate ? prefetchPlayerProfile : undefined}
            onMouseDown={canNavigate ? prefetchPlayerProfile : undefined}
            onFocus={canNavigate ? prefetchPlayerProfile : undefined}
            onTouchStart={canNavigate ? prefetchPlayerProfile : undefined}
          >
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 overflow-hidden shadow-lg hover:ring-2 hover:ring-blue-500/50 transition-all">
              <PlayerPhoto
                playerName={group.playerName}
                sport={group.sport.toLowerCase()}
                size={64}
                className="w-16 h-16 rounded-lg object-cover"
              />
            </div>
          </div>
          
          {/* Player Info & Primary Prop */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div 
                className={cn("group/name", canNavigate ? "cursor-pointer" : "cursor-not-allowed opacity-60")}
                onClick={canNavigate ? handlePlayerClick : undefined}
                onMouseEnter={canNavigate ? prefetchPlayerProfile : undefined}
                onMouseDown={canNavigate ? prefetchPlayerProfile : undefined}
                onFocus={canNavigate ? prefetchPlayerProfile : undefined}
                onTouchStart={canNavigate ? prefetchPlayerProfile : undefined}
              >
                <h3 className="text-base font-bold text-white truncate group-hover/name:text-blue-400 transition-colors">
                  {displayName}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-white/50">{group.team}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
                    {group.sport}
                  </span>
                </div>
              </div>
              
              {/* Split Button: Quick Add + Choose Board */}
              {(onQuickAdd || onChooseBoard || onToggleFollow) && (
                <div className="relative flex items-center gap-1 opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-all">
                  {onToggleFollow && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFollow(group.playerName);
                      }}
                      className={cn(
                        "p-1.5 rounded-lg transition-all",
                        isFollowed
                          ? "bg-amber-500/25 text-amber-300"
                          : "bg-white/[0.04] hover:bg-amber-500/20 text-white/40 hover:text-amber-400"
                      )}
                      title={isFollowed ? "Unfollow player" : "Follow player"}
                    >
                      <Star className={cn("w-4 h-4", isFollowed && "fill-amber-300")} />
                    </button>
                  )}
                  {recentlyAdded ? (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs">
                      <Check className="w-3 h-3" />
                      <span>Added</span>
                    </div>
                  ) : (
                    <>
                      {/* Main quick-add button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickAdd?.(primaryProp);
                          setRecentlyAdded(true);
                          setTimeout(() => setRecentlyAdded(false), 2000);
                        }}
                        className="p-1.5 rounded-l-lg bg-white/[0.04] hover:bg-amber-500/20 text-white/40 hover:text-amber-400 transition-all border-r border-white/[0.08]"
                        title="Quick add to active board"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      {/* Dropdown arrow for board selection */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDropdown(!showDropdown);
                        }}
                        className="p-1.5 rounded-r-lg bg-white/[0.04] hover:bg-amber-500/20 text-white/40 hover:text-amber-400 transition-all"
                        title="Choose watchboard"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {/* Dropdown menu */}
                      {showDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdown(false);
                            }}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdown(false);
                                onChooseBoard?.(primaryProp);
                              }}
                              className="w-full px-3 py-2 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                            >
                              Choose board...
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Primary Prop Display */}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">
                  {PROP_TYPE_LABELS[primaryProp.prop_type] || primaryProp.prop_type}
                </span>
                {primaryProp.movement != null && Number(primaryProp.movement) !== 0 && (
                  <span className={cn(
                    "flex items-center gap-0.5 text-xs",
                    Number(primaryProp.movement) > 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {Number(primaryProp.movement) > 0 
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />
                    }
                    <span>{Number(primaryProp.movement) > 0 ? '+' : ''}{Number(primaryProp.movement).toFixed(1)}</span>
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white">{primaryProp.line_value}</span>
                {primaryProp.odds_american && (
                  <span className={cn(
                    "text-sm",
                    primaryProp.odds_american > 0 ? "text-emerald-400" : "text-white/50"
                  )}>
                    {formatOdds(primaryProp.odds_american)}
                  </span>
                )}
              </div>
            </div>

            {(intel?.l5Pct != null || intel?.seasonPct != null || intel?.h2hPct != null) && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                {intel?.l5Pct != null && (
                  <span
                    title={`Last 5: ${intel.l5Hits}/${intel.l5Total} overs`}
                    className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/70 border border-white/[0.08]"
                  >
                    L5 {intel.l5Pct}% {intel.l5Total > 0 ? `(${intel.l5Hits}/${intel.l5Total})` : ''}
                  </span>
                )}
                {intel?.seasonPct != null && (
                  <span
                    title={`Season sample: ${intel.seasonHits}/${intel.seasonTotal} overs`}
                    className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/70 border border-white/[0.08]"
                  >
                    SZN {intel.seasonPct}% {intel.seasonTotal > 0 ? `(${intel.seasonHits}/${intel.seasonTotal})` : ''}
                  </span>
                )}
                {intel?.h2hPct != null && (
                  <span
                    title={`Team H2H: ${intel.h2hWins}/${intel.h2hTotal} wins`}
                    className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25"
                  >
                    H2H {intel.h2hPct}% {intel.h2hTotal > 0 ? `(${intel.h2hWins}/${intel.h2hTotal})` : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Sportsbook Comparison Strip */}
        {uniqueSportsbooks.length > 1 && (
          <div className="mt-3 pt-3 border-t border-white/[0.04]">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {uniqueSportsbooks.slice(0, 5).map(book => {
                const bookProp = sportsbookLines[book][0];
                return (
                  <div 
                    key={book}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1 rounded-md border text-xs shrink-0",
                      getSportsbookColor(book)
                    )}
                  >
                    <span className="font-medium truncate max-w-[60px]">{book}</span>
                    <span className="font-bold">{bookProp.line_value}</span>
                    {bookProp.odds_american && (
                      <span className="opacity-70">{formatOdds(bookProp.odds_american)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Expand for more props */}
        {additionalProps.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] text-white/40 text-xs transition-colors"
            >
              <span>{expanded ? 'Show less' : `+${additionalProps.length} more props`}</span>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            
            {expanded && (
              <div className="mt-2 space-y-1">
                {additionalProps.map(prop => (
                  <div 
                    key={`${prop.id}-${prop.prop_type}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]"
                  >
                    <span className="text-xs text-white/50">
                      {PROP_TYPE_LABELS[prop.prop_type] || prop.prop_type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{prop.line_value}</span>
                      {prop.odds_american && (
                        <span className="text-xs text-white/40">{formatOdds(prop.odds_american)}</span>
                      )}
                      {prop.movement != null && Number(prop.movement) !== 0 && (
                        <span className={cn(
                          "text-xs",
                          Number(prop.movement) > 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {Number(prop.movement) > 0 ? '+' : ''}{Number(prop.movement).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CoachGPropsChat({ 
  props, 
  selectedSport 
}: { 
  props: PlayerProp[];
  selectedSport: string;
}) {
  const { user } = useDemoAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);
  
  const suggestedQuestions = [
    "Which props have the best value today?",
    "Who should I target for points?",
    "Any line movement I should know about?",
    "Best player combos for a parlay?"
  ];
  
  const askCoachG = async () => {
    if (!message.trim() || isLoading) return;
    
    const userMessage = message.trim();
    setMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    try {
      // Build context about current props view
      const topPlayers = props.slice(0, 10).map(p => 
        `${p.player_name} (${p.team}) - ${PROP_TYPE_LABELS[p.prop_type] || p.prop_type}: ${p.line_value}`
      ).join('\n');
      
      const contextMessage = `[Context: User is viewing ${selectedSport === 'ALL' ? 'all sports' : selectedSport} player props. Top props shown:\n${topPlayers}]\n\nUser question: ${userMessage}`;
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': user?.id?.toString() || ''
        },
        credentials: 'include',
        body: JSON.stringify({
          persona: 'coach',
          message: contextMessage,
          pageContext: 'props',
          conversationHistory: chatHistory.slice(-6)
        })
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const data = await response.json();
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: data.structured?.answerSummary || data.response 
      }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: "Having trouble connecting. Try again in a moment." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 z-50",
          "w-14 h-14 rounded-full bg-blue-500 shadow-xl shadow-blue-500/30",
          "flex items-center justify-center",
          "hover:scale-110 transition-transform",
          "group"
        )}
      >
        <img 
          src="/assets/coachg/coach-g-avatar.png"
          alt="Coach G"
          className="w-10 h-10 rounded-full"
        />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-amber-900" />
        </span>
      </button>
    );
  }
  
  return (
    <div className={cn(
      "fixed bottom-20 right-4 z-50",
      "w-[380px] max-w-[calc(100vw-32px)]",
      "bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl",
      "flex flex-col max-h-[60vh]",
      "animate-in slide-in-from-bottom-4 fade-in duration-200"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img 
            src="/assets/coachg/coach-g-avatar.png"
            alt="Coach G"
            className="w-10 h-10 rounded-full"
          />
          <div>
            <h3 className="font-semibold text-white flex items-center gap-1.5">
              Coach G
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </h3>
            <p className="text-xs text-white/50">Props Expert</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {chatHistory.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-white/60 text-center">
              Ask me about today's player props
            </p>
            <div className="space-y-2">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setMessage(q);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-sm text-white/70 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatHistory.map((msg, i) => (
              <div 
                key={i}
                className={cn(
                  "flex",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "max-w-[85%] px-3 py-2 rounded-2xl text-sm",
                  msg.role === 'user'
                    ? "bg-blue-500 text-white rounded-br-md"
                    : "bg-white/[0.06] text-white/90 rounded-bl-md"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askCoachG()}
            placeholder="Ask about props..."
            className="flex-1 bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-blue-500/30"
            disabled={isLoading}
          />
          <button
            onClick={askCoachG}
            disabled={!message.trim() || isLoading}
            className="px-4 py-2.5 rounded-xl bg-blue-500 text-white disabled:opacity-50 hover:bg-blue-600 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white/[0.03] rounded-xl p-4 animate-pulse">
          <div className="h-1 bg-white/10 rounded mb-4" />
          <div className="flex gap-4">
            <div className="w-16 h-16 rounded-lg bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-32 bg-white/10 rounded" />
              <div className="h-3 w-20 bg-white/10 rounded" />
              <div className="h-8 w-24 bg-white/10 rounded mt-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PropsUnavailableStub({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative min-h-screen">
      <CinematicBackground />
      <div className="relative z-10 max-w-3xl mx-auto px-4 py-6 space-y-4 pb-24">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </button>
          <div className="flex-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-white">Player Props</h1>
          </div>
        </div>
        
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-400/60" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Player Props Coming Soon</h2>
          <p className="text-white/50 text-sm max-w-md mx-auto mb-6">
            Player prop lines require additional data access. Check back later.
          </p>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-colors"
          >
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function PlayerPropsPage() {
  const navigate = useNavigate();
  const { user } = useDemoAuth();
  const { hasProps, loading: capabilitiesLoading } = useProviderCapabilities();
  const { addProp, activeBoard } = useWatchboards();
  const { favoriteSports, followedPlayers, saveFavorites } = useFavoriteSports();
  
  const [props, setProps] = useState<PlayerProp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('NBA');
  const [selectedPropType, setSelectedPropType] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string>('ALL');
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>('ALL');
  
  // Watchboard modal state
  const [showWatchboardModal, setShowWatchboardModal] = useState(false);
  const [selectedPropForModal, setSelectedPropForModal] = useState<PlayerProp | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [localFollowedPlayers, setLocalFollowedPlayers] = useState<string[]>([]);
  const [playerLogsByToken, setPlayerLogsByToken] = useState<Record<string, Array<{ stats: Record<string, string | number> }>>>({});
  const [h2hByMatchupKey, setH2hByMatchupKey] = useState<Record<string, { sampleSize: number; teamAWins: number; teamBWins: number }>>({});
  const propsRef = useRef<PlayerProp[]>([]);
  const propsFetchSeqRef = useRef(0);
  const propsAbortRef = useRef<AbortController | null>(null);
  const autoRecoveredEmptySportRef = useRef(false);
  const [propsSnapshotGate, setPropsSnapshotGate] = useState<"idle" | "warming" | "ready">("idle");
  const propsWarmedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOLLOWED_PLAYERS_LOCAL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setLocalFollowedPlayers(parsed.filter((v): v is string => typeof v === 'string'));
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  const statFromGame = useCallback((game: { stats?: Record<string, string | number> }, propType: string): number | null => {
    const keys = getStatKeysForPropType(propType);
    if (keys.length === 0) return null;
    const numFor = (candidate: string): number | null => {
      const raw = game?.stats?.[candidate];
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    if (keys.includes('PRA') || keys.includes('PR') || keys.includes('PA') || keys.includes('RA')) {
      const pts = numFor('PTS') ?? numFor('Points') ?? 0;
      const reb = numFor('REB') ?? numFor('Rebounds') ?? numFor('TRB') ?? 0;
      const ast = numFor('AST') ?? numFor('Assists') ?? 0;
      if (keys.includes('PRA')) return pts + reb + ast;
      if (keys.includes('PR')) return pts + reb;
      if (keys.includes('PA')) return pts + ast;
      if (keys.includes('RA')) return reb + ast;
    }
    for (const key of keys) {
      const value = numFor(key);
      if (value !== null) return value;
    }
    return null;
  }, []);

  useEffect(() => {
    const cacheKey = `route:props:${selectedSport}`;
    const cached = getRouteCache<PlayerProp[]>(cacheKey, 45000);
    if (!cached || cached.length === 0) return;
    setProps((prev) => (prev.length > 0 ? prev : cached));
    setLoading(false);
  }, [selectedSport]);

  useEffect(() => {
    if (!selectedSport || props.length === 0) return;
    setRouteCache(`route:props:${selectedSport}`, props, 90000);
  }, [selectedSport, props]);

  // Pick an initial fast-path sport from favorites when available.
  useEffect(() => {
    if (favoriteSports.length === 0) return;
    const mapped = favoriteSports
      .map((s) => String(s || '').toUpperCase())
      .find((s) => SPORTS.some((entry) => entry.key === s));
    if (!mapped) return;
    setSelectedSport((prev) => (prev === 'NBA' ? mapped : prev));
  }, [favoriteSports]);

  const propsStableKey = useMemo(() => {
    if (props.length === 0) return "0";
    return `${props.length}:${props.reduce((acc, p) => acc + Number(p.id || 0), 0)}`;
  }, [props]);

  useEffect(() => {
    propsWarmedKeysRef.current.clear();
  }, [selectedSport]);

  useEffect(() => {
    if (loading) {
      setPropsSnapshotGate("idle");
      return;
    }
    if (props.length === 0) {
      setPropsSnapshotGate("ready");
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    setPropsSnapshotGate("warming");
    dispatchWorkerPrewarmForPropsFeed(props);
    void (async () => {
      await prewarmPropsFeedSnapshots(props, {
        concurrency: 16,
        warmedKeysRef: propsWarmedKeysRef,
        signal: ac.signal,
      });
      if (!cancelled) setPropsSnapshotGate("ready");
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [loading, propsStableKey, selectedSport]);

  const fetchPropsPage = useCallback(async (reset: boolean) => {
    if (capabilitiesLoading) return;
    const stopPerf = startPerfTimer(reset ? 'props.fetch.reset' : 'props.fetch.more');
    if (!hasProps) {
      setLoading(false);
      return;
    }
    if (!reset && loadingMore) return;

    const requestId = ++propsFetchSeqRef.current;
    if (reset) {
      propsAbortRef.current?.abort();
      propsAbortRef.current = new AbortController();
    }
    const controller = reset ? propsAbortRef.current : new AbortController();
    const timer = setTimeout(() => controller?.abort(), 8000);

    if (reset) {
      // Keep currently visible props on screen while refreshing.
      setLoading(propsRef.current.length === 0);
      if (propsRef.current.length === 0) setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const limit = selectedSport === 'ALL' ? 1200 : 3000;
      const offset = reset ? 0 : nextOffset;
      const qs = new URLSearchParams({
        sport: selectedSport || 'ALL',
        limit: String(limit),
        offset: String(offset),
      });
      const url = `/api/sports-data/props/today?${qs.toString()}`;
      const data = await fetchJsonCached<any>(url, {
        cacheKey: `props:${selectedSport}:${offset}:${limit}`,
        ttlMs: 6000,
        timeoutMs: 8000,
        init: { credentials: 'include', signal: controller?.signal },
      });
      if (requestId !== propsFetchSeqRef.current) return;

      let incoming = Array.isArray(data?.props) ? data.props : [];
      let incomingErrors = Array.isArray(data?.errors)
        ? data.errors.filter((msg: unknown): msg is string => typeof msg === 'string')
        : [];

      // Guardrail: if a specific sport returns empty, auto-fallback to ALL once.
      // This prevents a blank page when user lands on an off-season sport.
      if (
        reset &&
        selectedSport !== 'ALL' &&
        incoming.length === 0 &&
        !autoRecoveredEmptySportRef.current
      ) {
        try {
          const fallbackSports = ['NBA', 'ALL'].filter((s) => s !== selectedSport);
          for (const fallbackSport of fallbackSports) {
            const fallbackLimit = fallbackSport === 'ALL' ? 1200 : 3000;
            const fallbackUrl = `/api/sports-data/props/today?sport=${encodeURIComponent(fallbackSport)}&limit=${fallbackLimit}&offset=0&fresh=1`;
            const fallbackData = await fetchJsonCached<any>(fallbackUrl, {
              cacheKey: `props:${fallbackSport}:0:${fallbackLimit}:fresh`,
              ttlMs: 3000,
              timeoutMs: 7000,
              init: { credentials: 'include' },
            });
            const fallbackIncoming = Array.isArray(fallbackData?.props) ? fallbackData.props : [];
            if (fallbackIncoming.length > 0) {
              incoming = fallbackIncoming;
              autoRecoveredEmptySportRef.current = true;
              setSelectedSport(fallbackSport);
              setSelectedPropType(null);
              setSelectedGameId('ALL');
              setSelectedPlayerName('ALL');
              setToast({
                message: `${selectedSport} has no live props right now. Showing ${fallbackSport} props.`,
                type: 'success',
              });
              setTimeout(() => setToast(null), 3500);
              break;
            }
            const fallbackErrors = Array.isArray(fallbackData?.errors)
              ? fallbackData.errors.filter((msg: unknown): msg is string => typeof msg === 'string')
              : [];
            if (fallbackErrors.length > 0) {
              incomingErrors = incomingErrors.concat(fallbackErrors);
            }
          }
        } catch {
          // Non-fatal: keep original empty sport response.
        }
      }

      setFeedErrors(incomingErrors);
      setProps((prev) => {
        if (reset) return incoming;
        const seen = new Set(prev.map((p) => String(p.id)));
        const merged = [...prev];
        for (const row of incoming) {
          const key = String((row as any)?.id || '');
          if (key && seen.has(key)) continue;
          merged.push(row);
        }
        return merged;
      });

      const hasMoreValue = Boolean(data?.has_more);
      const next = Number(data?.next_offset);
      setHasMore(hasMoreValue);
      setNextOffset(Number.isFinite(next) ? next : offset + incoming.length);

      if (reset) {
        const stats = getFetchCacheStats();
        console.debug('[PropsPage][fetch-cache]', stats);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('Failed to fetch props:', err);
      if (propsRef.current.length === 0) {
        setError('Unable to load player props. Check back when games are scheduled.');
      } else {
        incrementPerfCounter('props.staleProtected');
      }
    } finally {
      stopPerf();
      clearTimeout(timer);
      if (requestId === propsFetchSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      if (reset) {
        logPerfSnapshot('PropsPage');
      }
    }
  }, [capabilitiesLoading, hasProps, loadingMore, selectedSport, nextOffset]);

  // Fetch props
  useEffect(() => {
    void fetchPropsPage(true);
  }, [fetchPropsPage]);

  // Show stub if props not available
  if (!capabilitiesLoading && !hasProps) {
    return <PropsUnavailableStub onBack={() => navigate('/games')} />;
  }

  // Get prop types for current sport
  const availablePropTypes = useMemo(() => {
    if (selectedSport === 'ALL') {
      const types = new Set<string>();
      props.forEach(p => types.add(p.prop_type));
      return Array.from(types);
    }
    return PROP_CATEGORIES[selectedSport as keyof typeof PROP_CATEGORIES] || [];
  }, [props, selectedSport]);

  const availableGames = useMemo(() => {
    let filtered = [...props];
    if (selectedSport !== 'ALL') {
      filtered = filtered.filter((p) => p.sport === selectedSport);
    }
    const byGame = new Map<string, PlayerProp>();
    for (const prop of filtered) {
      if (!byGame.has(prop.game_id)) {
        byGame.set(prop.game_id, prop);
      }
    }
    return Array.from(byGame.entries()).map(([gameId, sample]) => ({
      gameId,
      label: getGameDisplayLabel(gameId, sample),
    }));
  }, [props, selectedSport]);

  const realPropsGamesToday = useMemo(() => {
    const byGame = new Map<string, { sample: PlayerProp; count: number }>();
    for (const prop of props) {
      const existing = byGame.get(prop.game_id);
      if (existing) {
        existing.count += 1;
      } else {
        byGame.set(prop.game_id, { sample: prop, count: 1 });
      }
    }
    return Array.from(byGame.entries())
      .map(([gameId, value]) => ({
        gameId,
        label: getGameDisplayLabel(gameId, value.sample),
        count: value.count,
        sport: value.sample.sport,
      }))
      .sort((a, b) => b.count - a.count);
  }, [props]);

  const availablePlayers = useMemo(() => {
    let filtered = [...props];
    if (selectedSport !== 'ALL') {
      filtered = filtered.filter((p) => p.sport === selectedSport);
    }
    if (selectedGameId !== 'ALL') {
      filtered = filtered.filter((p) => p.game_id === selectedGameId);
    }
    const playerNames = new Set<string>();
    filtered.forEach((p) => playerNames.add(p.player_name));
    return Array.from(playerNames).sort((a, b) => a.localeCompare(b));
  }, [props, selectedSport, selectedGameId]);

  // Filter and group props
  const groupedProps = useMemo(() => {
    let filtered = [...props];
    
    // Sport filter
    if (selectedSport !== 'ALL') {
      filtered = filtered.filter(p => p.sport === selectedSport);
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.player_name.toLowerCase().includes(query) ||
        (p.team && p.team.toLowerCase().includes(query))
      );
    }

    // Game filter
    if (selectedGameId !== 'ALL') {
      filtered = filtered.filter((p) => p.game_id === selectedGameId);
    }

    // Player filter
    if (selectedPlayerName !== 'ALL') {
      filtered = filtered.filter((p) => p.player_name === selectedPlayerName);
    }
    
    // Prop type filter
    if (selectedPropType) {
      filtered = filtered.filter(p => p.prop_type === selectedPropType);
    }
    
    // Group by player
    const grouped: Record<string, GroupedProp> = {};
    filtered.forEach(prop => {
      const strictSourceId = strictPlayerIdFromPropSource(prop as PlayerProp & Record<string, unknown>);
      const key = `${prop.player_name}-${prop.team}-${prop.sport}-${strictSourceId || `unresolved:${prop.id}`}`;
      if (!grouped[key]) {
        grouped[key] = {
          playerName: prop.player_name,
          playerId: strictSourceId,
          team: prop.team || 'Unknown',
          sport: prop.sport,
          props: [],
        };
      }
      grouped[key].props.push(prop);
    });
    
    // Sort players by first prop's line value (descending - bigger stars first)
    return Object.values(grouped).map((row) => ({
      playerName: row.playerName,
      playerId: row.playerId,
      team: row.team,
      sport: row.sport,
      props: row.props,
    })).sort((a, b) => {
      // Prioritize players with more props (usually bigger names)
      if (a.props.length !== b.props.length) {
        return b.props.length - a.props.length;
      }
      // Then by line value
      return (b.props[0]?.line_value || 0) - (a.props[0]?.line_value || 0);
    });
  }, [props, searchQuery, selectedSport, selectedPropType, selectedGameId, selectedPlayerName]);

  useEffect(() => {
    let cancelled = false;
    const visibleGroups = groupedProps;
    const uniquePlayers = Array.from(new Set(visibleGroups.map((g) => normalizePlayerToken(g.playerName)).filter(Boolean)));
    const missingPlayers = visibleGroups
      .map((g) => ({ token: normalizePlayerToken(g.playerName), name: normalizePlayerName(g.playerName), team: g.team, sport: g.sport }))
      .filter((row) => row.token && !playerLogsByToken[row.token]);
    const seen = new Set<string>();
    const dedupedMissing = missingPlayers.filter((row) => {
      if (seen.has(row.token)) return false;
      seen.add(row.token);
      return true;
    }).slice(0, 12);

    const missingMatchups = visibleGroups
      .map((g) => {
        const p = g.props[0];
        const home = String(p?.home_team || '').trim();
        const away = String(p?.away_team || '').trim();
        if (!home || !away) return null;
        const key = `${g.sport}|${normalizeToken(home)}|${normalizeToken(away)}`;
        return { key, sport: g.sport, home, away };
      })
      .filter((row): row is { key: string; sport: string; home: string; away: string } => Boolean(row && row.key && !h2hByMatchupKey[row.key]))
      .slice(0, 12);

    if (uniquePlayers.length === 0) return;
    if (dedupedMissing.length === 0 && missingMatchups.length === 0) return;

    const run = async () => {
      const [playerResults, h2hResults] = await Promise.all([
        Promise.allSettled(
          dedupedMissing.map(async (row) => {
            const res = await fetch(
              `/api/player/${encodeURIComponent(String(row.sport || '').toUpperCase())}/${encodeURIComponent(row.name)}?team=${encodeURIComponent(String(row.team || ''))}`,
              { credentials: 'include', cache: 'no-store' }
            );
            if (!res.ok) return { token: row.token, logs: [] as Array<{ stats: Record<string, string | number> }> };
            const json = await res.json();
            return { token: row.token, logs: Array.isArray(json?.gameLog) ? json.gameLog : [] };
          })
        ),
        Promise.allSettled(
          missingMatchups.map(async (row) => {
            const res = await fetch(
              `/api/teams/${encodeURIComponent(String(row.sport || '').toUpperCase())}/h2h?teamA=${encodeURIComponent(row.home)}&teamB=${encodeURIComponent(row.away)}&window=10`,
              { credentials: 'include', cache: 'no-store' }
            );
            if (!res.ok) return { key: row.key, sampleSize: 0, teamAWins: 0, teamBWins: 0 };
            const json = await res.json();
            return {
              key: row.key,
              sampleSize: Number(json?.sampleSize || 0),
              teamAWins: Number(json?.series?.teamAWins || 0),
              teamBWins: Number(json?.series?.teamBWins || 0),
            };
          })
        ),
      ]);

      if (cancelled) return;

      setPlayerLogsByToken((prev) => {
        const next = { ...prev };
        for (const result of playerResults) {
          if (result.status !== 'fulfilled') continue;
          if (!next[result.value.token]) next[result.value.token] = result.value.logs;
        }
        return next;
      });

      setH2hByMatchupKey((prev) => {
        const next = { ...prev };
        for (const result of h2hResults) {
          if (result.status !== 'fulfilled') continue;
          if (!next[result.value.key]) next[result.value.key] = result.value;
        }
        return next;
      });
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [groupedProps, props, h2hByMatchupKey, playerLogsByToken, selectedSport]);

  const intelByGroupKey = useMemo(() => {
    const out: Record<string, PropIntelSnapshot> = {};
    for (const group of groupedProps) {
      const key = `${group.playerName}-${group.team}-${group.sport}`;
      const primary = group.props[0];
      if (!primary) continue;
      const token = normalizePlayerToken(group.playerName);
      const logs = playerLogsByToken[token] || [];
      const evalRate = (scope: 'l5' | 'season'): { pct: number | null; hits: number; total: number } => {
        const sample = (scope === 'l5' ? logs.slice(0, 5) : logs).slice(0, 12);
        if (sample.length === 0) return { pct: null, hits: 0, total: 0 };
        let hits = 0;
        let total = 0;
        for (const g of sample) {
          const value = statFromGame(g, primary.prop_type);
          if (value === null) continue;
          total += 1;
          if (value > Number(primary.line_value)) hits += 1;
        }
        if (total === 0) return { pct: null, hits, total };
        return { pct: Math.round((hits / total) * 100), hits, total };
      };
      const l5 = evalRate('l5');
      const season = evalRate('season');

      let h2hPct: number | null = null;
      let h2hWins = 0;
      let h2hTotal = 0;
      const home = String(primary.home_team || '').trim();
      const away = String(primary.away_team || '').trim();
      if (home && away) {
        const matchupKey = `${group.sport}|${normalizeToken(home)}|${normalizeToken(away)}`;
        const matchup = h2hByMatchupKey[matchupKey];
        if (matchup && matchup.sampleSize > 0) {
          const teamToken = normalizeToken(group.team || '');
          const homeToken = normalizeToken(home);
          const awayToken = normalizeToken(away);
          if (teamToken && (teamToken.includes(homeToken) || homeToken.includes(teamToken))) {
            h2hWins = matchup.teamAWins;
            h2hTotal = matchup.sampleSize;
            h2hPct = Math.round((h2hWins / h2hTotal) * 100);
          } else if (teamToken && (teamToken.includes(awayToken) || awayToken.includes(teamToken))) {
            h2hWins = matchup.teamBWins;
            h2hTotal = matchup.sampleSize;
            h2hPct = Math.round((h2hWins / h2hTotal) * 100);
          }
        }
      }

      out[key] = {
        l5Pct: l5.pct,
        l5Hits: l5.hits,
        l5Total: l5.total,
        seasonPct: season.pct,
        seasonHits: season.hits,
        seasonTotal: season.total,
        h2hPct,
        h2hWins,
        h2hTotal,
      };
    }
    return out;
  }, [groupedProps, h2hByMatchupKey, playerLogsByToken, statFromGame]);

  // Quick add to active board
  const handleQuickAdd = useCallback(async (prop: PlayerProp) => {
    if (!user) {
      setToast({ message: "Sign in to track props", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    try {
      const result = await addProp({
        game_id: prop.game_id || '',
        player_name: prop.player_name,
        player_id: prop.player_id,
        team: prop.team || '',
        sport: prop.sport,
        prop_type: prop.prop_type,
        line_value: prop.line_value,
        selection: 'OVER',
        odds_american: prop.odds_american || -110,
        added_from: 'props_page_quick'
      });
      
      if (result.success) {
        setToast({ message: `Added to ${result.boardName || activeBoard?.name || 'Watchboard'}`, type: 'success' });
      } else {
        setToast({ message: result.error || 'Failed to add', type: 'error' });
      }
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Failed to add prop to watchboard:', err);
      setToast({ message: 'Failed to add prop', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  }, [user, addProp, activeBoard?.name]);
  
  // Open modal to choose board
  const handleChooseBoard = useCallback((prop: PlayerProp) => {
    if (!user) {
      setToast({ message: "Sign in to track props", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSelectedPropForModal(prop);
    setShowWatchboardModal(true);
  }, [user]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedSport('ALL');
    setSelectedPropType(null);
    setSelectedGameId('ALL');
    setSelectedPlayerName('ALL');
  }, []);

  const hasActiveFilters =
    searchQuery ||
    selectedSport !== 'ALL' ||
    selectedPropType ||
    selectedGameId !== 'ALL' ||
    selectedPlayerName !== 'ALL';

  const effectiveFollowedPlayers = useMemo(() => {
    const set = new Set<string>();
    for (const name of followedPlayers || []) {
      const normalized = normalizePlayerName(name);
      if (normalized) set.add(normalized);
    }
    for (const name of localFollowedPlayers || []) {
      const normalized = normalizePlayerName(name);
      if (normalized) set.add(normalized);
    }
    return Array.from(set);
  }, [followedPlayers, localFollowedPlayers]);

  const followedPlayerKeys = useMemo(
    () => new Set(effectiveFollowedPlayers.map((name) => normalizeFollowedPlayerKey(name))),
    [effectiveFollowedPlayers]
  );

  const handleToggleFollowPlayer = useCallback(async (rawName: string) => {
    const normalizedName = normalizePlayerName(rawName);
    const normalizedKey = normalizeFollowedPlayerKey(normalizedName);
    const existing = Array.isArray(effectiveFollowedPlayers) ? effectiveFollowedPlayers : [];
    const exists = existing.some((name) => normalizeFollowedPlayerKey(name) === normalizedKey);
    const nextPlayers = exists
      ? existing.filter((name) => normalizeFollowedPlayerKey(name) !== normalizedKey)
      : [...existing, normalizedName];

    // Always update local state immediately for responsive UX.
    setLocalFollowedPlayers(nextPlayers);
    try {
      localStorage.setItem(FOLLOWED_PLAYERS_LOCAL_KEY, JSON.stringify(nextPlayers));
    } catch {
      // no-op
    }

    // Try persisting to account if signed in.
    const ok = user ? await saveFavorites(favoriteSports, false, undefined, nextPlayers) : false;
    setToast({
      message: ok
        ? (exists ? `Unfollowed ${normalizedName}` : `Following ${normalizedName}`)
        : (exists ? `Unfollowed ${normalizedName} (saved on this device)` : `Following ${normalizedName} (saved on this device)`),
      type: 'success',
    });
    setTimeout(() => setToast(null), 3000);
  }, [user, effectiveFollowedPlayers, saveFavorites, favoriteSports]);

  useEffect(() => {
    if (selectedGameId !== 'ALL' && !availableGames.some((g) => g.gameId === selectedGameId)) {
      setSelectedGameId('ALL');
    }
  }, [selectedGameId, availableGames]);

  useEffect(() => {
    if (selectedPlayerName !== 'ALL' && !availablePlayers.includes(selectedPlayerName)) {
      setSelectedPlayerName('ALL');
    }
  }, [selectedPlayerName, availablePlayers]);

  const filteredPropsCount = useMemo(
    () => groupedProps.reduce((sum, group) => sum + group.props.length, 0),
    [groupedProps]
  );

  const filteredGamesCount = useMemo(() => {
    const ids = new Set<string>();
    groupedProps.forEach((group) => {
      group.props.forEach((prop) => ids.add(prop.game_id));
    });
    return ids.size;
  }, [groupedProps]);

  return (
    <div className="relative min-h-screen">
      <CinematicBackground />
      
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/games')}
            className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold text-white">Player Props</h1>
            </div>
            <p className="text-xs text-white/40 mt-0.5">
              {props.length} props from multiple sportsbooks
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-slate-900/80 to-emerald-500/10 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-amber-200/80">Props Intel Terminal</p>
              <p className="mt-1 text-sm text-white/80">
                Track player lines, movement, and watchboard-ready edges across today's slate.
              </p>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
              Live Feed
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/45">Visible Props</p>
              <p className="text-base font-bold text-white">{filteredPropsCount}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/45">Players</p>
              <p className="text-base font-bold text-white">{groupedProps.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/45">Games</p>
              <p className="text-base font-bold text-white">{filteredGamesCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
              type="text"
              placeholder="Search player or team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full pl-12 pr-10 py-3 rounded-xl",
                "bg-white/[0.04] border border-white/[0.08]",
                "text-white placeholder:text-white/30",
                "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20",
                "transition-all text-sm"
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4 text-white/40" />
              </button>
            )}
          </div>

          {/* Sport Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
            {SPORTS.map((sport) => (
              <SportTab
                key={sport.key}
                sport={sport}
                active={selectedSport === sport.key}
                onClick={() => {
                  setSelectedSport(sport.key);
                  setSelectedPropType(null);
                }}
              />
            ))}
          </div>

          {/* Prop Type Chips */}
          {availablePropTypes.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
              <PropTypeChip
                type="ALL"
                active={selectedPropType === null}
                onClick={() => setSelectedPropType(null)}
              />
              {availablePropTypes.slice(0, 8).map(type => (
                <PropTypeChip
                  key={type}
                  type={type}
                  active={selectedPropType === type}
                  onClick={() => setSelectedPropType(selectedPropType === type ? null : type)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Real Props Games Today */}
        {realPropsGamesToday.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-white/80">Live Slate Coverage</p>
              <p className="text-[10px] text-white/45">{realPropsGamesToday.length} games</p>
            </div>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className={cn(
                "w-full px-3 py-2.5 rounded-xl text-sm",
                "bg-white/[0.04] border border-white/[0.08] text-white",
                "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
              )}
            >
              <option value="ALL" className="bg-slate-900 text-white">All Slate Games</option>
              {realPropsGamesToday.map((game) => (
                <option key={game.gameId} value={game.gameId} className="bg-slate-900 text-white">
                  {game.label} ({game.count} props)
                </option>
              ))}
            </select>

            {realPropsGamesToday.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {realPropsGamesToday.slice(0, 3).map((game) => (
                  <button
                    key={`quick-${game.gameId}`}
                    onClick={() => setSelectedGameId(game.gameId)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs border whitespace-nowrap transition-colors",
                      selectedGameId === game.gameId
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                        : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:bg-white/[0.06]"
                    )}
                  >
                    {game.label} ({game.count})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Game + Player Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            className={cn(
              "w-full px-3 py-2.5 rounded-xl text-sm",
              "bg-white/[0.04] border border-white/[0.08] text-white",
              "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            )}
          >
            <option value="ALL" className="bg-slate-900 text-white">All Games</option>
            {availableGames.map((game) => (
              <option key={game.gameId} value={game.gameId} className="bg-slate-900 text-white">
                {game.label}
              </option>
            ))}
          </select>

          <select
            value={selectedPlayerName}
            onChange={(e) => setSelectedPlayerName(e.target.value)}
            className={cn(
              "w-full px-3 py-2.5 rounded-xl text-sm",
              "bg-white/[0.04] border border-white/[0.08] text-white",
              "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            )}
          >
            <option value="ALL" className="bg-slate-900 text-white">All Players</option>
            {availablePlayers.map((player) => (
              <option key={player} value={player} className="bg-slate-900 text-white">
                {normalizePlayerName(player)}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-amber-300 hover:text-amber-200 transition-colors"
          >
            Clear all filters
          </button>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-white/25 px-1">
          Intelligence view only. No wagering is executed in this product.
        </p>

        {/* Loading State */}
        {loading && <LoadingSkeleton />}

        {/* Error State */}
        {error && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 text-center">
            <Target className="w-10 h-10 text-amber-400/50 mx-auto mb-3" />
            <p className="text-white/70 mb-2">{error}</p>
            <button
              onClick={() => navigate('/games')}
              className="text-xs text-amber-400 hover:underline"
            >
              Back to Games
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && groupedProps.length === 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/50 mb-1">
              {props.length === 0 
                ? "No props available for today's games"
                : "No props match your filters"
              }
            </p>
            {!hasActiveFilters && props.length === 0 && selectedSport !== 'ALL' && (
              <p className="text-xs text-amber-300/80 mt-2">
                {`${selectedSport} props are temporarily unavailable right now. Try ALL or another sport.`}
              </p>
            )}
            {!hasActiveFilters && props.length === 0 && feedErrors.length > 0 && (
              <p className="text-[11px] text-white/40 mt-2">
                {feedErrors[0]}
              </p>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-amber-400 hover:underline mt-2"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Props Grid */}
        {!loading && !error && groupedProps.length > 0 && (
          <div className="relative min-h-[120px]">
            {propsSnapshotGate === "warming" && (
              <div
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-slate-950/75 backdrop-blur-[2px] border border-white/10"
                aria-live="polite"
              >
                <div className="text-center px-4 max-w-sm">
                  <p className="text-sm font-medium text-white/95">Preparing player profiles…</p>
                  <p className="text-[11px] text-white/45 mt-1.5">
                    Warming snapshots for every player on this feed so navigation is instant.
                  </p>
                </div>
              </div>
            )}
        <div
          className={cn(
            "grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity duration-200",
            propsSnapshotGate === "warming" && "opacity-80"
          )}
        >
              {groupedProps.map((group) => (
                <PlayerPropCard
                  key={`${group.playerName}-${group.team}-${group.sport}`}
                  group={group}
                  snapshotsReady={propsSnapshotGate === "ready"}
                  intel={intelByGroupKey[`${group.playerName}-${group.team}-${group.sport}`] || null}
                  onQuickAdd={handleQuickAdd}
                  onChooseBoard={handleChooseBoard}
                  isFollowed={followedPlayerKeys.has(normalizeFollowedPlayerKey(group.playerName))}
                  onToggleFollow={handleToggleFollowPlayer}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && !error && hasMore && (
          <div className="pt-2 flex justify-center">
            <button
              onClick={() => void fetchPropsPage(false)}
              disabled={loadingMore}
              className={cn(
                "px-4 py-2 rounded-lg text-sm border transition-colors",
                loadingMore
                  ? "bg-white/[0.04] border-white/[0.08] text-white/40"
                  : "bg-white/[0.06] border-white/[0.14] text-white/80 hover:bg-white/[0.1]"
              )}
            >
              {loadingMore ? 'Loading more...' : propsSnapshotGate === "warming" ? 'Preparing profiles in background…' : 'Load more props'}
            </button>
          </div>
        )}
      </div>
      
      {/* Coach G Chat */}
      <CoachGPropsChat props={props} selectedSport={selectedSport} />
      
      {/* Toast Notification */}
      {toast && (
        <div 
          className={cn(
            "fixed bottom-24 left-1/2 -translate-x-1/2 z-50",
            "px-4 py-2 rounded-full text-sm font-medium shadow-lg",
            "animate-in slide-in-from-bottom-4 fade-in duration-200",
            toast.type === 'success' 
              ? "bg-emerald-500/90 text-white" 
              : "bg-red-500/90 text-white"
          )}
        >
          {toast.message}
        </div>
      )}
      
      {/* Watchboard Selection Modal */}
      {selectedPropForModal && (
        <AddPropToWatchboardModal
          isOpen={showWatchboardModal}
          onClose={() => {
            setShowWatchboardModal(false);
            setSelectedPropForModal(null);
          }}
          prop={{
            game_id: selectedPropForModal.game_id || '',
            player_name: selectedPropForModal.player_name,
            player_id: selectedPropForModal.player_id,
            team: selectedPropForModal.team || '',
            sport: selectedPropForModal.sport,
            prop_type: selectedPropForModal.prop_type,
            line_value: selectedPropForModal.line_value,
            selection: 'OVER',
            odds_american: selectedPropForModal.odds_american || -110,
          }}
          propSummary={`${normalizePlayerName(selectedPropForModal.player_name)} ${PROP_TYPE_LABELS[selectedPropForModal.prop_type] || selectedPropForModal.prop_type} ${selectedPropForModal.line_value}`}
          onSuccess={(boardName) => {
            setToast({ message: `Added to ${boardName}`, type: 'success' });
            setTimeout(() => setToast(null), 3000);
          }}
          onError={(error) => {
            setToast({ message: error, type: 'error' });
            setTimeout(() => setToast(null), 3000);
          }}
        />
      )}
    </div>
  );
}

export default PlayerPropsPage;
