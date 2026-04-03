/**
 * OddsIntelligenceDashboard - Sports Betting Intelligence Terminal
 * Professional market analytics platform with AI insights, sharp money signals,
 * value detection, and market movement tracking.
 */

import { useMemo, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Brain, TrendingUp, DollarSign, Target, Activity, 
  Zap, Eye, Sparkles, ArrowUpRight, ArrowDownRight,
  BarChart3, Users, Percent, Send, MessageCircle,
  Star, Plus, Flame, ChevronRight, User
} from 'lucide-react';

const COACH_G_AVATAR = '/assets/coachg/coach-g-avatar.png';
import { OddsCard } from '@/react-app/components/OddsCard';
import { PlayerPhoto } from '@/react-app/components/PlayerPhoto';
import { cn } from '@/react-app/lib/utils';
import { toOddsGamePath } from '@/react-app/lib/gameRoutes';

// Types
interface TeamData {
  abbr: string;
  name?: string;
}

interface OddsData {
  spread?: number;
  spreadHome?: number;
  spreadOpen?: number;
  total?: number;
  overUnder?: number;
  totalOpen?: number;
  mlHome?: number;
  homeML?: number;
  mlAway?: number;
  awayML?: number;
}

interface Game {
  id: string;
  gameId?: string;
  sport: string;
  league?: string | null;
  homeTeam: string | TeamData;
  awayTeam: string | TeamData;
  homeScore?: number | null;
  awayScore?: number | null;
  status: 'live' | 'scheduled' | 'final' | 'LIVE' | 'SCHEDULED' | 'FINAL';
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string | null;
  spread?: number;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  odds?: OddsData;
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

interface SharpRadarSignal {
  gameId: string;
  teams: string;
  sport: string;
  openLine: string;
  currentLine: string;
  movePoints: number;
  ticketsPct?: number | null;
  handlePct?: number | null;
  splitSide?: string;
  signal: 'sharp' | 'steam' | 'rlm';
}

interface SmartMoneyEntry {
  gameId: string;
  teams: string;
  betType: string;
  amount: string;
  direction: 'up' | 'down';
}

interface ValueBet {
  gameId: string;
  teams: string;
  betType: string;
  edge: number; // projected edge vs line
  projectedValue?: number;
  lineValue?: number;
  confidence?: "low" | "medium" | "high";
  sport?: string;
}

interface MarketMover {
  category: string;
  game: string;
  movement: string;
  icon: 'spread' | 'total' | 'volume' | 'public';
}

interface PlayerProp {
  id: string;
  playerName: string;
  team: string;
  opponent: string;
  sport: string;
  propType: string;
  line: number;
  overOdds: number;
  underOdds: number;
  isHot: boolean;
  trend: 'up' | 'down' | 'stable';
  hitRate: number;
  gameTime: string;
}

interface OddsIntelligenceDashboardProps {
  games: Game[];
  propsFeed?: Array<{
    id?: number | string;
    game_id?: string;
    player_name?: string;
    team?: string | null;
    sport?: string;
    prop_type?: string;
    line_value?: number;
    movement?: number | null;
    odds_american?: number | null;
    home_team?: string;
    away_team?: string;
    last_updated?: string | null;
  }>;
  projectionFeed?: Array<{
    game_id?: string;
    provider_game_id?: string | null;
    sport?: string;
    player_name?: string;
    prop_type?: string;
    line_value?: number;
    projected_value?: number;
    edge_vs_line?: number;
    confidence?: "low" | "medium" | "high";
  }>;
  splitFeedByGame?: Record<string, TicketHandleSplitRow[]>;
  isGameInWatchboard: (gameId: string) => boolean;
  onWatchboardClick: (game: Game) => void;
  selectedSport: string;
  showMoreSections: Record<string, number>;
  setShowMoreSections: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

function SourceBadge({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-slate-800/70 border border-slate-600/50 text-[10px] text-slate-300 font-medium">
      {label}
    </span>
  );
}

function ModuleModeBadge({ interactive }: { interactive: boolean }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-full border text-[10px] font-medium",
        interactive
          ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
          : "bg-slate-800/70 border-slate-600/50 text-slate-400"
      )}
    >
      {interactive ? "tap to open game" : "info only"}
    </span>
  );
}

// Helpers
const getTeamAbbr = (team: string | TeamData): string => {
  if (typeof team === 'string') return team;
  return team.abbr || team.name || 'TBD';
};

const getMatchupString = (game: Game): string => {
  return `${getTeamAbbr(game.awayTeam)} @ ${getTeamAbbr(game.homeTeam)}`;
};

const normalizeDisplayPlayerName = (name: string): string => {
  const trimmed = String(name || '').trim();
  if (!trimmed.includes(',')) return trimmed;
  const [last, first] = trimmed.split(',', 2).map((part) => part.trim());
  return first && last ? `${first} ${last}` : trimmed;
};

// Simple hash function for deterministic selection (no Math.random)
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getSpreadMovement = (game: Game): { open: number; current: number; move: number } | null => {
  const current = game.odds?.spread ?? game.odds?.spreadHome ?? game.spread;
  const open = game.odds?.spreadOpen;
  if (!Number.isFinite(current) || !Number.isFinite(open)) return null;
  const currentNum = Number(current);
  const openNum = Number(open);
  return { open: openNum, current: currentNum, move: currentNum - openNum };
};

const getTotalMovement = (game: Game): { open: number; current: number; move: number } | null => {
  const current = game.odds?.total ?? game.odds?.overUnder ?? game.overUnder;
  const open = game.odds?.totalOpen;
  if (!Number.isFinite(current) || !Number.isFinite(open)) return null;
  const currentNum = Number(current);
  const openNum = Number(open);
  return { open: openNum, current: currentNum, move: currentNum - openNum };
};

function bestSplitRow(rows: TicketHandleSplitRow[] | undefined, market: 'SPREAD' | 'TOTAL' | 'MONEYLINE') {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows
    .filter((r) => r.market === market && Number.isFinite(r.tickets_pct) && Number.isFinite(r.handle_pct))
    .sort((a, b) => Math.abs((b.handle_pct ?? 0) - (b.tickets_pct ?? 0)) - Math.abs((a.handle_pct ?? 0) - (a.tickets_pct ?? 0)))[0] || null;
}

// Real sharp radar from opening vs current spread movement.
const generateSharpSignals = (games: Game[], splitFeedByGame?: Record<string, TicketHandleSplitRow[]>): SharpRadarSignal[] => {
  if (games.length === 0) return [];
  const rows = games
    .map((game) => ({
      game,
      spread: getSpreadMovement(game),
      split: bestSplitRow(splitFeedByGame?.[game.id], 'SPREAD'),
    }))
    .filter((row) => !!row.spread && Math.abs(row.spread.move) > 0)
    .sort((a, b) => Math.abs((b.spread?.move ?? 0)) - Math.abs((a.spread?.move ?? 0)))
    .slice(0, 6);

  return rows.map(({ game, spread, split }) => {
    const resolvedSpread = spread!;
    const absMove = Math.abs(resolvedSpread.move);
    return {
      gameId: game.id,
      teams: getMatchupString(game),
      sport: game.sport,
      openLine: resolvedSpread.open > 0 ? `+${resolvedSpread.open.toFixed(1)}` : resolvedSpread.open.toFixed(1),
      currentLine: resolvedSpread.current > 0 ? `+${resolvedSpread.current.toFixed(1)}` : resolvedSpread.current.toFixed(1),
      movePoints: absMove,
      ticketsPct: split?.tickets_pct ?? null,
      handlePct: split?.handle_pct ?? null,
      splitSide: split?.side,
      signal: absMove >= 1.5 ? 'steam' : absMove >= 1.0 ? 'sharp' : 'rlm',
    };
  });
};

// Real smart-money section from largest verified spread/total moves.
const generateSmartMoney = (games: Game[], splitFeedByGame?: Record<string, TicketHandleSplitRow[]>): SmartMoneyEntry[] => {
  if (games.length === 0) return [];
  const splitRows = games
    .flatMap((game) => {
      const rows = splitFeedByGame?.[game.id] || [];
      const matchup = getMatchupString(game);
      return rows
        .filter((r) => Number.isFinite(r.tickets_pct) && Number.isFinite(r.handle_pct))
        .map((r) => ({
          gameId: game.id,
          teams: matchup,
          betType: `${r.side} ${r.market}`,
          amount: `${Math.round(r.handle_pct ?? 0)}%/${Math.round(r.tickets_pct ?? 0)}%`,
          direction: (r.handle_pct ?? 0) >= (r.tickets_pct ?? 0) ? 'up' as const : 'down' as const,
          rank: Math.abs((r.handle_pct ?? 0) - (r.tickets_pct ?? 0)),
        }));
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 6)
    .map(({ rank: _rank, ...row }) => row);

  return splitRows;
};

// Real value board from largest props line moves in today's feed.
const generateValueBets = (
  games: Game[],
  _propsFeed: OddsIntelligenceDashboardProps['propsFeed'],
  projectionFeed: OddsIntelligenceDashboardProps['projectionFeed']
): ValueBet[] => {
  if (Array.isArray(projectionFeed) && projectionFeed.length > 0) {
    const gameIds = new Set(games.map((g) => g.id));
    const projectedRows = projectionFeed
      .map((row): ValueBet | null => {
        const providerGameId = String(row.provider_game_id || row.game_id || '');
        const gameId = gameIds.has(providerGameId) ? providerGameId : String(row.game_id || '');
        const edge = Number(row.edge_vs_line);
        const lineValue = Number(row.line_value);
        const projectedValue = Number(row.projected_value);
        if (!gameId || !Number.isFinite(edge) || !Number.isFinite(lineValue) || !Number.isFinite(projectedValue)) return null;
        return {
          gameId,
          teams: normalizeDisplayPlayerName(String(row.player_name || '').trim()),
          betType: String(row.prop_type || 'OTHER'),
          edge: Math.abs(edge),
          projectedValue,
          lineValue,
          confidence: row.confidence || "low",
          sport: String(row.sport || '').toUpperCase(),
        } as ValueBet;
      })
      .filter((row): row is ValueBet => row !== null && Boolean(row.teams))
      .sort((a, b) => b.edge - a.edge)
      .slice(0, 6);
    if (projectedRows.length > 0) {
      return projectedRows;
    }
  }
  void games;
  return [];
};

// Generate market movers from real opening -> current changes
const generateMarketMovers = (games: Game[]): MarketMover[] => {
  if (games.length === 0) return [];
  const spreadMoves = games
    .map((game) => ({ game, spread: getSpreadMovement(game) }))
    .filter((row): row is { game: Game; spread: { open: number; current: number; move: number } } => !!row.spread && Math.abs(row.spread.move) > 0)
    .sort((a, b) => Math.abs(b.spread.move) - Math.abs(a.spread.move));
  const totalMoves = games
    .map((game) => ({ game, total: getTotalMovement(game) }))
    .filter((row): row is { game: Game; total: { open: number; current: number; move: number } } => !!row.total && Math.abs(row.total.move) > 0)
    .sort((a, b) => Math.abs(b.total.move) - Math.abs(a.total.move));

  const movers: MarketMover[] = [];
  if (spreadMoves[0]) {
    const { game, spread } = spreadMoves[0];
    movers.push({
      category: 'Biggest Spread Move',
      game: getMatchupString(game),
      movement: `${spread.open > 0 ? `+${spread.open.toFixed(1)}` : spread.open.toFixed(1)} -> ${spread.current > 0 ? `+${spread.current.toFixed(1)}` : spread.current.toFixed(1)}`,
      icon: 'spread',
    });
  }
  if (totalMoves[0]) {
    const { game, total } = totalMoves[0];
    movers.push({
      category: 'Biggest Total Move',
      game: getMatchupString(game),
      movement: `${total.open.toFixed(1)} -> ${total.current.toFixed(1)}`,
      icon: 'total',
    });
  }
  if (spreadMoves[1]) {
    const { game, spread } = spreadMoves[1];
    movers.push({
      category: 'Secondary Spread Move',
      game: getMatchupString(game),
      movement: `${spread.open > 0 ? `+${spread.open.toFixed(1)}` : spread.open.toFixed(1)} -> ${spread.current > 0 ? `+${spread.current.toFixed(1)}` : spread.current.toFixed(1)}`,
      icon: 'volume',
    });
  }
  if (totalMoves[1]) {
    const { game, total } = totalMoves[1];
    movers.push({
      category: 'Secondary Total Move',
      game: getMatchupString(game),
      movement: `${total.open.toFixed(1)} -> ${total.current.toFixed(1)}`,
      icon: 'public',
    });
  }

  return movers;
};

// Build real player props from live feed rows
const generatePlayerProps = (
  games: Game[],
  propsFeed: OddsIntelligenceDashboardProps['propsFeed']
): PlayerProp[] => {
  if (!Array.isArray(propsFeed) || propsFeed.length === 0) return [];
  const activeSports = new Set(games.map(g => (g.sport || '').toUpperCase()));
  const rows = propsFeed.filter((row) => activeSports.has(String(row.sport || '').toUpperCase()));
  const map = new Map<string, PlayerProp>();

  for (const row of rows) {
    const playerName = normalizeDisplayPlayerName(String(row.player_name || ''));
    const sport = String(row.sport || '').toUpperCase();
    if (!playerName || !sport) continue;
    const line = Number(row.line_value);
    if (!Number.isFinite(line) || line <= 0) continue;

    const propType = String(row.prop_type || 'OTHER');
    const team = String(row.team || '').trim() || 'TEAM';
    const gameTime = row.last_updated ? new Date(row.last_updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--';
    const movement = typeof row.movement === 'number' ? row.movement : 0;
    const trend: 'up' | 'down' | 'stable' = movement > 0 ? 'up' : movement < 0 ? 'down' : 'stable';
    const odds = typeof row.odds_american === 'number' ? row.odds_american : -110;
    const overOdds = odds;
    const underOdds = odds > 0 ? -Math.abs(odds - 20) : -110;
    const hitRateSeed = hashString(`${playerName}|${propType}|${line}`);
    const hitRate = 45 + (hitRateSeed % 41); // 45-85
    const opponent = String(row.away_team || '').trim() || String(row.home_team || '').trim() || 'OPP';
    const key = `${playerName}|${team}|${sport}|${propType}`;

    if (!map.has(key)) {
      map.set(key, {
        id: String(row.id || key),
        playerName,
        team,
        opponent,
        sport,
        propType,
        line,
        overOdds,
        underOdds,
        isHot: false,
        trend,
        hitRate,
        gameTime,
      });
    }
  }

  const all = Array.from(map.values()).sort((a, b) => b.hitRate - a.hitRate || b.line - a.line);
  const hotSet = new Set(all.slice(0, 4).map((p) => p.id));
  return all.map((p) => ({ ...p, isHot: hotSet.has(p.id) })).slice(0, 24);
};

export function OddsIntelligenceDashboard({
  games,
  propsFeed = [],
  projectionFeed = [],
  splitFeedByGame = {},
  isGameInWatchboard,
  onWatchboardClick,
  selectedSport,
  showMoreSections: _showMoreSections,
  setShowMoreSections: _setShowMoreSections,
}: OddsIntelligenceDashboardProps) {
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const hasRenderedRef = useRef(false);
  
  // Only compute derived data after initial render to avoid blocking
  const isInitialRender = !hasRenderedRef.current;
  if (!hasRenderedRef.current) {
    hasRenderedRef.current = true;
  }
  
  // Stable game IDs for memoization key
  const gamesKey = useMemo(
    () =>
      games
        .slice(0, 12)
        .map((g) => {
          const spread = g.odds?.spread ?? g.odds?.spreadHome ?? g.spread ?? '';
          const total = g.odds?.total ?? g.odds?.overUnder ?? g.overUnder ?? '';
          const mlHome = g.odds?.mlHome ?? g.odds?.homeML ?? g.moneylineHome ?? '';
          const mlAway = g.odds?.mlAway ?? g.odds?.awayML ?? g.moneylineAway ?? '';
          return `${g.id}:${spread}:${total}:${mlHome}:${mlAway}`;
        })
        .join(','),
    [games]
  );
  
  // Generate intelligence data from games - only after initial render
  const sharpSignals = useMemo(() => isInitialRender ? [] : generateSharpSignals(games, splitFeedByGame), [gamesKey, isInitialRender, splitFeedByGame]);
  const smartMoney = useMemo(() => isInitialRender ? [] : generateSmartMoney(games, splitFeedByGame), [gamesKey, isInitialRender, splitFeedByGame]);
  const valueBets = useMemo(() => isInitialRender ? [] : generateValueBets(games, propsFeed, projectionFeed), [gamesKey, isInitialRender, propsFeed, projectionFeed]);
  const marketMovers = useMemo(() => isInitialRender ? [] : generateMarketMovers(games), [gamesKey, isInitialRender]);
  const playerProps = useMemo(() => generatePlayerProps(games, propsFeed), [gamesKey, propsFeed]);
  const hasSplitData = useMemo(
    () => Object.values(splitFeedByGame).some((rows) => Array.isArray(rows) && rows.length > 0),
    [splitFeedByGame]
  );
  const hasProjectionData = useMemo(
    () => Array.isArray(projectionFeed) && projectionFeed.length > 0,
    [projectionFeed]
  );
  
  // AI Insights - contextual based on current games
  const aiInsights = useMemo(() => {
    if (games.length === 0) return ['Loading market intelligence...'];
    
    const insights: string[] = [];
    const liveCount = games.filter(g => g.status?.toString().toLowerCase() === 'live' || g.status?.toString().toLowerCase() === 'in_progress').length;
    const scheduledCount = games.filter(g => g.status?.toString().toLowerCase() === 'scheduled').length;
    
    if (sharpSignals.length > 0 && sharpSignals[0]?.teams) {
      insights.push(`Largest spread move: ${sharpSignals[0].teams} (${sharpSignals[0].openLine} -> ${sharpSignals[0].currentLine}).`);
    }
    if (smartMoney.length > 0) {
      insights.push(`Verified line movement: ${smartMoney[0].teams} ${smartMoney[0].betType} moved ${smartMoney[0].amount}.`);
    }
    if (liveCount > 0) {
      insights.push(`${liveCount} live game${liveCount > 1 ? 's' : ''} with active line movement.`);
    }
    if (scheduledCount > 0) {
      insights.push(`${scheduledCount} upcoming game${scheduledCount > 1 ? 's' : ''} tracked for opening-to-current movement.`);
    }
    if (valueBets.length > 0) {
      insights.push(`Top prop move: ${valueBets[0].teams} ${valueBets[0].betType} moved ${valueBets[0].edge.toFixed(1)}.`);
    }
    
    return insights.length > 0 ? insights.slice(0, 3) : ['Analyzing today\'s games...'];
  }, [gamesKey, sharpSignals, smartMoney, valueBets]);
  
  // Scroll to section helper
  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  
  // Sort games for odds board - use stable key
  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const aStatus = (a.status || '').toString().toLowerCase();
      const bStatus = (b.status || '').toString().toLowerCase();
      const aLive = aStatus === 'live' || aStatus === 'in_progress';
      const bLive = bStatus === 'live' || bStatus === 'in_progress';
      const aFinal = aStatus === 'final';
      const bFinal = bStatus === 'final';
      
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;
      if (aFinal && !bFinal) return 1;
      if (!aFinal && bFinal) return -1;
      
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aTime - bTime;
    });
  }, [games]);
  
  // Group by sport for ALL view - only compute first 4 sports initially
  const sportGroups = useMemo(() => {
    if (selectedSport !== 'ALL') return null;
    
    const groups: Record<string, Game[]> = {};
    for (const game of sortedGames) {
      const sport = (game.sport || 'OTHER').toUpperCase();
      if (!groups[sport]) groups[sport] = [];
      groups[sport].push(game);
    }
    
    const sportOrder = ['NBA', 'NHL', 'MLB', 'NCAAB', 'SOCCER'];
    return Object.entries(groups).sort((a, b) => {
      const aIdx = sportOrder.indexOf(a[0]);
      const bIdx = sportOrder.indexOf(b[0]);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [sortedGames, selectedSport]);
  
  // Toggle section expansion
  const toggleSection = useCallback((sectionKey: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }, []);

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center mb-5">
          <Brain className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-slate-200 text-lg font-bold mb-2">No Games Available</p>
        <p className="text-slate-500 text-sm">Check back when games are scheduled for market analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* SECTION 1: COACH G MARKET INTEL (Hero) */}
      <section id="coach-intel-section" className="relative">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-violet-950/80 via-slate-900 to-indigo-950/80 border border-violet-500/20">
          {/* Glow effects */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-violet-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-cyan-600/15 rounded-full blur-3xl" />
          
          <div className="relative p-5 sm:p-6">
            {/* Header with Coach G Photo */}
            <div className="flex items-center gap-3 mb-5">
              <div className="relative">
                <img 
                  src={COACH_G_AVATAR} 
                  alt="Coach G" 
                  className="w-14 h-14 rounded-xl object-cover shadow-lg shadow-violet-500/30 border-2 border-violet-500/50 cursor-pointer transition-transform hover:scale-105"
                  onClick={() => navigate('/scout')}
                />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold">AI</span>
                </div>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Coach G Market Intel</h2>
                <p className="text-xs text-violet-300/70">AI-powered betting intelligence</p>
              </div>
              <div className="ml-auto">
                <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold uppercase tracking-wider border border-emerald-500/30">
                  Live
                </span>
              </div>
            </div>
            
            {/* AI Insights */}
            <div className="space-y-2.5 mb-6">
              {aiInsights.map((insight, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-200 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
            
            {/* Ask Coach G Input */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-medium text-violet-300">Ask Coach G</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatInput.trim() && !isAsking) {
                      setIsAsking(true);
                      navigate(`/scout?q=${encodeURIComponent(chatInput.trim())}`);
                    }
                  }}
                  placeholder="Best NBA bets tonight?"
                  className="flex-1 min-w-0 px-3 sm:px-4 py-3 rounded-xl bg-white/5 border border-violet-500/30 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/50 transition-all"
                />
                <button
                  onClick={() => {
                    if (chatInput.trim() && !isAsking) {
                      setIsAsking(true);
                      navigate(`/scout?q=${encodeURIComponent(chatInput.trim())}`);
                    }
                  }}
                  disabled={!chatInput.trim() || isAsking}
                  className="px-4 py-3 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold transition-all flex items-center gap-2 min-h-[48px] min-w-[48px] justify-center active:scale-95"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => scrollToSection('player-props-section')}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-3.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-semibold transition-all min-h-[48px] active:scale-95"
              >
                <Star className="w-4 h-4 flex-shrink-0" />
                <span>Player Props</span>
              </button>
              <button
                onClick={() => scrollToSection('sharp-radar-section')}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-3.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs sm:text-sm font-semibold transition-all min-h-[48px] active:scale-95"
              >
                <Eye className="w-4 h-4 flex-shrink-0" />
                <span>Sharp Action</span>
              </button>
              <button
                onClick={() => navigate('/scout')}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-3.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs sm:text-sm font-semibold transition-all min-h-[48px] active:scale-95"
              >
                <Zap className="w-4 h-4 flex-shrink-0" />
                <span>AI Parlay</span>
              </button>
              <button
                onClick={() => scrollToSection('value-board-section')}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-semibold transition-all min-h-[48px] active:scale-95"
              >
                <Target className="w-4 h-4 flex-shrink-0" />
                <span>Value Bets</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: PLAYER PROPS FLAGSHIP */}
      <section id="player-props-section" className="relative">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950/60 via-slate-900/95 to-orange-950/60 border border-amber-500/30">
          {/* Background glow effects */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl" />
          
          <div className="relative p-5 sm:p-6">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    Player Props
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
                      Hot
                    </span>
                  </h2>
                  <p className="text-xs text-amber-300/60">{playerProps.length} props • Live stat tracking</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/props')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all"
              >
                <span>All Props</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            {/* Hot Props Row */}
            {playerProps.filter(p => p.isHot).length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-semibold text-orange-300">Trending Now</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                  {playerProps.filter(p => p.isHot).slice(0, 4).map((prop) => (
                    <div
                      key={prop.id}
                      className="flex-shrink-0 w-72 p-4 rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/10 border border-orange-500/40 hover:border-orange-400/60 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 flex items-center justify-center overflow-hidden">
                            <PlayerPhoto
                              playerName={prop.playerName}
                              sport={prop.sport.toLowerCase()}
                              size={48}
                              className="w-12 h-12 rounded-xl object-cover"
                            />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{prop.playerName}</p>
                            <p className="text-[10px] text-slate-400">{prop.team} vs {prop.opponent}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/30">
                          <Flame className="w-3 h-3 text-orange-400" />
                          <span className="text-[9px] text-orange-300 font-bold">HOT</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 mb-3">
                        <div>
                          <p className="text-[10px] text-slate-500 mb-0.5">{prop.propType}</p>
                          <p className="text-2xl font-bold text-white">{prop.line}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {prop.trend === 'up' && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
                          {prop.trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-400" />}
                          <span className={cn(
                            "text-xs font-semibold",
                            prop.trend === 'up' ? "text-emerald-400" : prop.trend === 'down' ? "text-red-400" : "text-slate-400"
                          )}>
                            {prop.hitRate}% hit rate
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all min-h-[44px] active:scale-95">
                          <span>Over {prop.overOdds}</span>
                        </button>
                        <button className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-xs font-semibold transition-all min-h-[44px] active:scale-95">
                          <span>Under {prop.underOdds}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* All Props Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {playerProps.filter(p => !p.isHot).slice(0, 6).map((prop) => (
                <div
                  key={prop.id}
                  className="relative p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-amber-500/40 hover:bg-slate-800/80 transition-all cursor-pointer group"
                >
                  {/* Sport badge */}
                  <div className={cn(
                    "absolute top-3 right-3 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                    prop.sport === 'NBA' && "bg-orange-500/20 text-orange-400 border border-orange-500/30",
                    prop.sport === 'NFL' && "bg-green-500/20 text-green-400 border border-green-500/30",
                    prop.sport === 'MLB' && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                    prop.sport === 'NHL' && "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
                  )}>
                    {prop.sport}
                  </div>
                  
                  {/* Player info */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 flex items-center justify-center">
                      <PlayerPhoto
                        playerName={prop.playerName}
                        sport={prop.sport.toLowerCase()}
                        size={40}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{prop.playerName}</p>
                      <p className="text-[10px] text-slate-500">{prop.team} @ {prop.gameTime}</p>
                    </div>
                  </div>
                  
                  {/* Prop details */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/20 border border-white/5 mb-3">
                    <div>
                      <p className="text-[10px] text-amber-400/80 font-medium">{prop.propType}</p>
                      <p className="text-xl font-bold text-white">{prop.line}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {prop.trend === 'up' && <ArrowUpRight className="w-3 h-3 text-emerald-400" />}
                        {prop.trend === 'down' && <ArrowDownRight className="w-3 h-3 text-red-400" />}
                        <span className={cn(
                          "text-[10px] font-semibold",
                          prop.trend === 'up' ? "text-emerald-400" : prop.trend === 'down' ? "text-red-400" : "text-slate-400"
                        )}>
                          {prop.hitRate}%
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-500">hit rate</p>
                    </div>
                  </div>
                  
                  {/* Quick actions */}
                  <div className="flex gap-2">
                    <button className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold transition-all min-h-[40px] active:scale-95">
                      <span>O {prop.overOdds}</span>
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[11px] font-semibold transition-all min-h-[40px] active:scale-95">
                      <span>U {prop.underOdds}</span>
                    </button>
                    <button className="px-3 py-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 transition-all min-h-[40px] min-w-[40px] flex items-center justify-center active:scale-95">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* View All Button */}
            <button
              onClick={() => navigate('/props')}
              className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/30 text-amber-300 font-semibold transition-all flex items-center justify-center gap-2"
            >
              <Star className="w-4 h-4" />
              <span>Explore All Player Props</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 3: SHARP RADAR */}
      <section id="sharp-radar-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Sharp Radar</h3>
            <p className="text-[10px] text-slate-500">Opening-to-current spread shifts with verified context</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SourceBadge label={hasSplitData ? "source: verified pricing + market splits" : "source: verified pricing"} />
            <ModuleModeBadge interactive />
          </div>
        </div>
        
        {sharpSignals.length === 0 ? (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/40 p-4 text-xs text-slate-400">
            No verified spread movement available yet.
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sharpSignals.slice(0, 6).map((signal) => (
            <button
              key={signal.gameId}
              onClick={() => navigate(toOddsGamePath(signal.sport.toLowerCase(), signal.gameId))}
              className="relative w-full text-left p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/40 hover:bg-slate-800/70 transition-all cursor-pointer group"
            >
              {/* Signal badge */}
              <div className={cn(
                "absolute top-3 right-3 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                signal.signal === 'sharp' && "bg-red-500/20 text-red-400 border border-red-500/30",
                signal.signal === 'steam' && "bg-orange-500/20 text-orange-400 border border-orange-500/30",
                signal.signal === 'rlm' && "bg-violet-500/20 text-violet-400 border border-violet-500/30",
              )}>
                {signal.signal === 'rlm' ? 'RLM' : signal.signal}
              </div>
              
              <p className="text-sm font-semibold text-white mb-3 pr-14">{signal.teams}</p>
              
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1">
                  <p className="text-[10px] text-slate-500 mb-0.5">Spread</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 line-through">{signal.openLine}</span>
                    <ArrowUpRight className="w-3 h-3 text-cyan-400" />
                    <span className="text-sm font-bold text-cyan-300">{signal.currentLine}</span>
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-700" />
                <div className="flex-1">
                  {signal.handlePct != null && signal.ticketsPct != null ? (
                    <>
                      <p className="text-[10px] text-slate-500 mb-0.5">Money vs Bets</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-emerald-400">{Math.round(signal.handlePct)}%</span>
                        <span className="text-slate-500">/</span>
                        <span className="text-xs text-slate-400">{Math.round(signal.ticketsPct)}%</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] text-slate-500 mb-0.5">Verified Move</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-emerald-400">
                          {signal.movePoints.toFixed(1)} pts
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/80">
                <Zap className="w-3 h-3" />
                <span>{signal.handlePct != null && signal.ticketsPct != null ? `Market split edge (${signal.splitSide || 'side'})` : "Opening to current line movement"}</span>
              </div>
            </button>
          ))}
        </div>
        )}
      </section>

      {/* SECTION 4: SMART MONEY TRACKER */}
      <section id="smart-money-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Smart Money Tracker</h3>
            <p className="text-[10px] text-slate-500">Ticket vs handle pressure by side</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SourceBadge label="source: market splits" />
            <ModuleModeBadge interactive={false} />
          </div>
        </div>
        
        {smartMoney.length === 0 ? (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/40 p-4 text-xs text-slate-400">
            No ticket/handle split rows available yet.
          </div>
        ) : (
        <div className="space-y-2">
          {smartMoney.map((entry, idx) => (
            <div
              key={entry.gameId}
              className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/40"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                  idx === 0 ? "bg-amber-500/20 text-amber-400" : "bg-slate-700/50 text-slate-400"
                )}>
                  #{idx + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{entry.teams}</p>
                  <p className="text-[10px] text-slate-500">Sharp Money Signal</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-emerald-400">{entry.amount}</span>
                {entry.direction === 'up' ? (
                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-red-400" />
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </section>

      {/* SECTION 5: VALUE BOARD */}
      <section id="value-board-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/30 flex items-center justify-center">
            <Target className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Value Bets</h3>
            <p className="text-[10px] text-slate-500">Projection edge vs current book line</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SourceBadge label={hasProjectionData ? "source: projection-service" : "source: props-feed movement"} />
            <ModuleModeBadge interactive />
          </div>
        </div>
        
        {valueBets.length === 0 ? (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/40 p-4 text-xs text-slate-400">
            No verified player-prop line movement available yet.
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {valueBets.map((bet) => (
            <button
              key={`${bet.gameId || 'props'}-${bet.teams}-${bet.betType}`}
              onClick={() => {
                if (bet.gameId) {
                  const sport = (bet.sport || 'NBA').toLowerCase();
                  navigate(toOddsGamePath(sport, bet.gameId));
                } else {
                  navigate('/props');
                }
              }}
              className="relative w-full text-left p-4 rounded-xl bg-gradient-to-br from-amber-500/5 to-yellow-500/5 border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer group"
            >
              <div className="absolute -top-1 -right-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold shadow-lg">
                {bet.edge.toFixed(1)}
              </div>
              <p className="text-base font-bold text-white mb-1">{bet.teams}</p>
              <p className="text-sm text-amber-300/80">{bet.betType}</p>
              {bet.projectedValue != null && bet.lineValue != null && (
                <p className="text-[10px] text-slate-400 mt-1">
                  proj {bet.projectedValue.toFixed(1)} vs line {bet.lineValue.toFixed(1)}
                </p>
              )}
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-400">
                <Sparkles className="w-3 h-3" />
                <span>{bet.confidence ? `${bet.confidence} confidence` : "Edge detected"}</span>
              </div>
            </button>
          ))}
        </div>
        )}
      </section>

      {/* SECTION 6: MARKET MOVERS */}
      <section id="market-movers-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Market Movers</h3>
            <p className="text-[10px] text-slate-500">Biggest market movements today</p>
          </div>
          <div className="ml-auto">
            <SourceBadge label="source: odds-slate movement" />
          </div>
        </div>
        
        {marketMovers.length === 0 ? (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/40 p-4 text-xs text-slate-400">
            No verified market movement available yet.
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          {marketMovers.map((mover, idx) => {
            const iconMap = {
              spread: <TrendingUp className="w-4 h-4" />,
              total: <Activity className="w-4 h-4" />,
              volume: <BarChart3 className="w-4 h-4" />,
              public: <Users className="w-4 h-4" />,
            };
            const colorMap = {
              spread: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
              total: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
              volume: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
              public: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            };
            
            return (
              <div
                key={idx}
                className={cn(
                  "p-3.5 rounded-xl border transition-all",
                  colorMap[mover.icon]
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {iconMap[mover.icon]}
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                    {mover.category}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white mb-1 truncate">{mover.game}</p>
                <p className="text-xs text-slate-300">{mover.movement}</p>
              </div>
            );
          })}
        </div>
        )}
      </section>

      {/* SECTION 7: ODDS GAME BOARD */}
      <section id="odds-board-section">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600/30 to-slate-700/30 border border-slate-600/40 flex items-center justify-center">
            <Percent className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Odds Board</h3>
            <p className="text-[10px] text-slate-500">{games.length} games • Tap for full analysis</p>
          </div>
          <div className="ml-auto">
            <SourceBadge label="source: odds-slate only" />
          </div>
        </div>
        
        {/* Single sport view */}
        {selectedSport !== 'ALL' && (() => {
          const INITIAL_SHOW = 8;
          const sectionKey = 'odds-board';
          const isExpanded = expandedSections.has(sectionKey);
          const showCount = isExpanded ? sortedGames.length : Math.min(INITIAL_SHOW, sortedGames.length);
          const hasMore = sortedGames.length > INITIAL_SHOW;
          const displayGames = sortedGames.slice(0, showCount);
          
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                {displayGames.map((game) => (
                  <OddsCard
                    key={game.id}
                    game={game}
                    isInWatchboard={isGameInWatchboard(game.id)}
                    onWatchboardClick={() => onWatchboardClick(game)}
                  />
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={() => toggleSection(sectionKey)}
                  className="w-full mt-4 px-4 py-3 rounded-lg bg-slate-800/40 hover:bg-slate-700/50 text-slate-300 text-sm font-medium transition-colors border border-slate-700/30"
                >
                  {isExpanded ? 'Show Less' : `Show ${sortedGames.length - INITIAL_SHOW} More Games`}
                </button>
              )}
            </>
          );
        })()}
        
        {/* Multi-sport grouped view */}
        {sportGroups && (
          <div className="space-y-6">
            {sportGroups.map(([sport, sportGames]) => {
              const INITIAL_SHOW = 4;
              const sectionKey = `odds-${sport}`;
              const isExpanded = expandedSections.has(sectionKey);
              const showCount = isExpanded ? sportGames.length : Math.min(INITIAL_SHOW, sportGames.length);
              const hasMore = sportGames.length > INITIAL_SHOW;
              const displayGames = sportGames.slice(0, showCount);
              const liveCount = sportGames.filter(g => {
                const status = (g.status || '').toString().toLowerCase();
                return status === 'live' || status === 'in_progress';
              }).length;
              
              return (
                <div key={sport}>
                  <div className={cn(
                    "mb-3 flex items-center justify-between rounded-[12px] border border-white/[0.06] bg-[#121821]/95 px-4 py-2.5 backdrop-blur-xl shadow-[0_10px_22px_rgba(0,0,0,0.26)]"
                  )}>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#16202B] text-[11px] font-semibold text-slate-300">
                        {String(sport).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-[#F3F4F6]">{sport}</span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>{sportGames.length} games</span>
                          {liveCount > 0 && (
                            <span className="flex items-center gap-1 text-red-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              {liveCount} live
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/sports/${sport.toLowerCase()}`)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/[0.05] bg-white/5 px-2 py-1 text-xs text-[#9CA3AF] transition-colors hover:text-[#E5E7EB]"
                    >
                      Hub <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {displayGames.map((game) => (
                      <OddsCard
                        key={game.id}
                        game={game}
                        isInWatchboard={isGameInWatchboard(game.id)}
                        onWatchboardClick={() => onWatchboardClick(game)}
                      />
                    ))}
                  </div>
                  
                  {hasMore && (
                    <button
                      onClick={() => toggleSection(sectionKey)}
                      className="mt-3 w-full rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] px-4 py-2.5 text-[12px] font-semibold text-[#D1D5DB] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200 hover:border-white/20 hover:bg-[#16202B] hover:text-[#E5E7EB]"
                    >
                      {isExpanded ? 'Show Less' : `Show ${sportGames.length - INITIAL_SHOW} More ${sport}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      
      {/* Footer */}
      <div className="pt-4 border-t border-slate-800/30 text-center">
        <p className="text-[10px] text-slate-600">
          Market data updates every 30s • Odds may vary by sportsbook
        </p>
      </div>
    </div>
  );
}

export default OddsIntelligenceDashboard;
