/**
 * Universal Live Tab Component
 * 
 * Shows only events relevant to the pool with grouped player impacts.
 * Works with any pool type via the plugin evaluator system.
 * Includes Live Alerts strip with risk counters and Pool Shock Alerts.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Flame, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Trophy,
  Users,
  RefreshCw,
  Wifi,
  WifiOff,
  Zap,
  TrendingDown,
  Flag,
  Star,
  FlaskConical,
} from 'lucide-react';
import { useDemoAuth } from '@/react-app/contexts/DemoAuthContext';
import { useLiveSweatSimulator } from '@/react-app/hooks/useLiveSweatSimulator';
import { SimControlsPanel } from '@/react-app/components/SimControlsPanel';
import { CelebrationManager, CelebrationEvent } from '@/react-app/components/Celebrations';

// Types matching backend
type PlayerStatus = 'WINNING' | 'AT_RISK' | 'TIED' | 'SAFE' | 'ELIMINATED' | 'PENDING' | 'PUSHED' | 'UNKNOWN';
type GameStatus = 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINAL' | 'POSTPONED' | 'CANCELED';

interface EvaluatedPlayer {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  selectionId: string;
  selectionLabel: string;
  status: PlayerStatus;
  statusReason?: string;
  confidenceRank?: number;
}

interface SelectionGroup {
  selectionId: string;
  selectionLabel: string;
  side: 'HOME' | 'AWAY' | 'OTHER';
  players: EvaluatedPlayer[];
  count: number;
}

interface LiveEventCard {
  eventId: string;
  eventType: string;
  sportKey: string;
  status: GameStatus;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period?: string;
  clock?: string;
  startTime?: string;
  isTied: boolean;
  groupedImpacts: SelectionGroup[];
  totalPlayers: number;
}

interface LiveTabProps {
  poolId: number;
  periodId: string;
  poolType?: string;
}

// Shock Alert types
type ShockAlertType = 'UPSET' | 'SWING' | 'FINAL';

interface ShockAlert {
  id: string;
  type: ShockAlertType;
  eventId: string;
  message: string;
  timestamp: number;
}

// Helper: compute aggregated stats
function computePoolStats(cards: LiveEventCard[]) {
  let atRiskCount = 0;
  let eliminatedCount = 0;
  let safeCount = 0;
  
  const seenUsers = new Set<string>();
  
  cards.forEach(card => {
    card.groupedImpacts.forEach(group => {
      group.players.forEach(player => {
        if (!seenUsers.has(player.userId)) {
          seenUsers.add(player.userId);
          if (player.status === 'AT_RISK') atRiskCount++;
          else if (player.status === 'ELIMINATED') eliminatedCount++;
          else if (player.status === 'SAFE' || player.status === 'WINNING') safeCount++;
        }
      });
    });
  });

  return { atRiskCount, eliminatedCount, safeCount, totalUsers: seenUsers.size };
}

// Helper: find most picked selection per game
function getMostPickedSelection(card: LiveEventCard): { group: SelectionGroup; isLosing: boolean } | null {
  if (card.groupedImpacts.length === 0) return null;
  
  const sorted = [...card.groupedImpacts].sort((a, b) => b.count - a.count);
  const mostPicked = sorted[0];
  
  // Determine if this selection is losing
  const isHome = mostPicked.side === 'HOME';
  const isAway = mostPicked.side === 'AWAY';
  const homeLosing = card.homeScore < card.awayScore;
  const awayLosing = card.awayScore < card.homeScore;
  
  const isLosing = (isHome && homeLosing) || (isAway && awayLosing);
  
  return { group: mostPicked, isLosing };
}

// Helper: generate shock alerts from current state
function generateShockAlerts(
  cards: LiveEventCard[], 
  prevCards: LiveEventCard[]
): ShockAlert[] {
  const alerts: ShockAlert[] = [];
  const now = Date.now();
  
  cards.forEach(card => {
    const isLive = card.status === 'LIVE' || card.status === 'HALFTIME';
    const mostPicked = getMostPickedSelection(card);
    
    if (!mostPicked) return;
    
    // UPSET ALERT: Most-picked side is losing in a live game
    if (isLive && mostPicked.isLosing) {
      alerts.push({
        id: `upset-${card.eventId}`,
        type: 'UPSET',
        eventId: card.eventId,
        message: `UPSET ALERT: ${mostPicked.group.count} picks on ${mostPicked.group.selectionLabel} are losing`,
        timestamp: now,
      });
    }
    
    // SWING ALERT: Check if lead changed (compare with previous)
    const prevCard = prevCards.find(p => p.eventId === card.eventId);
    if (prevCard && isLive) {
      const prevMostPicked = getMostPickedSelection(prevCard);
      if (prevMostPicked && !prevMostPicked.isLosing && mostPicked.isLosing) {
        alerts.push({
          id: `swing-${card.eventId}-${now}`,
          type: 'SWING',
          eventId: card.eventId,
          message: `SWING: ${mostPicked.group.selectionLabel} picks just moved to AT RISK`,
          timestamp: now,
        });
      }
    }
    
    // FINAL ALERT: Game ended with eliminations
    if (card.status === 'FINAL') {
      const prevCardStatus = prevCards.find(p => p.eventId === card.eventId);
      if (prevCardStatus && prevCardStatus.status !== 'FINAL') {
        const eliminatedCount = card.groupedImpacts.reduce((sum, g) => 
          sum + g.players.filter(p => p.status === 'ELIMINATED').length, 0
        );
        if (eliminatedCount > 0) {
          alerts.push({
            id: `final-${card.eventId}`,
            type: 'FINAL',
            eventId: card.eventId,
            message: `FINAL: ${eliminatedCount} eliminated in ${card.awayTeam} vs ${card.homeTeam}`,
            timestamp: now,
          });
        }
      }
    }
  });
  
  return alerts;
}

// Live Alerts Strip component
function LiveAlertsStrip({ 
  stats, 
  alerts,
  hasLiveEvents,
  onAlertClick 
}: { 
  stats: { atRiskCount: number; eliminatedCount: number; safeCount: number };
  alerts: ShockAlert[];
  hasLiveEvents: boolean;
  onAlertClick: (eventId: string) => void;
}) {
  if (!hasLiveEvents && alerts.length === 0) return null;

  return (
    <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 -mx-4 px-4 py-3 mb-4">
      {/* Counters */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs font-bold text-red-400">AT RISK</span>
          <span className="text-sm font-bold text-white tabular-nums">{stats.atRiskCount}</span>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20">
          <XCircle className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-bold text-gray-400">OUT</span>
          <span className="text-sm font-bold text-white tabular-nums">{stats.eliminatedCount}</span>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-xs font-bold text-green-400">SAFE</span>
          <span className="text-sm font-bold text-white tabular-nums">{stats.safeCount}</span>
        </div>
      </div>
      
      {/* Shock Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((alert, index) => (
            <button
              key={alert.id}
              onClick={() => onAlertClick(alert.eventId)}
              className={`
                w-full text-left px-3 py-2 rounded-lg transition-all cursor-pointer
                animate-in fade-in slide-in-from-top-2 duration-300
                ${alert.type === 'UPSET' 
                  ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 hover:border-orange-500/50' 
                  : alert.type === 'SWING'
                  ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 hover:border-yellow-500/50'
                  : 'bg-gradient-to-r from-slate-500/20 to-gray-500/20 border border-slate-500/30 hover:border-slate-500/50'}
              `}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center gap-2">
                {alert.type === 'UPSET' && <Zap className="w-4 h-4 text-orange-400 flex-shrink-0" />}
                {alert.type === 'SWING' && <TrendingDown className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                {alert.type === 'FINAL' && <Flag className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                <span className={`text-sm font-medium ${
                  alert.type === 'UPSET' ? 'text-orange-300' :
                  alert.type === 'SWING' ? 'text-yellow-300' : 'text-gray-300'
                }`}>
                  {alert.message}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Status chip component
function StatusChip({ status }: { status: PlayerStatus }) {
  const config: Record<PlayerStatus, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    WINNING: { bg: 'bg-green-500/20', text: 'text-green-400', icon: <Trophy className="w-3 h-3" />, label: 'WINNING' },
    AT_RISK: { bg: 'bg-red-500/20', text: 'text-red-400', icon: <AlertTriangle className="w-3 h-3" />, label: 'AT RISK' },
    TIED: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: <AlertTriangle className="w-3 h-3" />, label: 'TIED' },
    SAFE: { bg: 'bg-green-500/20', text: 'text-green-400', icon: <CheckCircle2 className="w-3 h-3" />, label: 'SAFE' },
    ELIMINATED: { bg: 'bg-gray-500/20', text: 'text-gray-400 line-through', icon: <XCircle className="w-3 h-3" />, label: 'OUT' },
    PENDING: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: <Clock className="w-3 h-3" />, label: 'PENDING' },
    PUSHED: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: <RefreshCw className="w-3 h-3" />, label: 'PUSH' },
    UNKNOWN: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: null, label: '—' },
  };

  const c = config[status] || config.UNKNOWN;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${c.bg} ${c.text}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

// Player row component
function PlayerRow({ player }: { player: EvaluatedPlayer }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {player.avatarUrl ? (
          <img src={player.avatarUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-white/70">{player.displayName.charAt(0)}</span>
          </div>
        )}
        <span className={`text-sm truncate ${player.status === 'ELIMINATED' ? 'text-gray-500 line-through' : 'text-white'}`}>
          {player.displayName}
        </span>
        {player.confidenceRank && (
          <span className="text-[10px] text-amber-400/70 font-mono">({player.confidenceRank})</span>
        )}
      </div>
      <StatusChip status={player.status} />
    </div>
  );
}

// Selection group component with Risk % and Most Picked badge
function SelectionGroupCard({ 
  group, 
  gameStatus,
  isMostPicked
}: { 
  group: SelectionGroup; 
  gameStatus: GameStatus;
  isMostPicked: boolean;
}) {
  const isLive = gameStatus === 'LIVE' || gameStatus === 'HALFTIME';
  const isFinal = gameStatus === 'FINAL';
  
  // Count statuses
  const winningCount = group.players.filter(p => p.status === 'WINNING' || p.status === 'SAFE').length;
  const atRiskCount = group.players.filter(p => p.status === 'AT_RISK').length;
  const eliminatedCount = group.players.filter(p => p.status === 'ELIMINATED').length;
  const tiedCount = group.players.filter(p => p.status === 'TIED').length;
  
  // Calculate risk %
  const riskPercent = group.count > 0 
    ? Math.round((atRiskCount / group.count) * 100)
    : 0;

  return (
    <div className={`bg-slate-800/50 rounded-lg p-3 ${isMostPicked ? 'ring-1 ring-amber-500/30' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{group.selectionLabel}</span>
          <span className="text-xs text-white/40">({group.count})</span>
          {isMostPicked && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
              <Star className="w-3 h-3" />
              <span className="text-[10px] font-bold">MOST PICKED</span>
            </span>
          )}
        </div>
      </div>
      
      {/* Status summary and Risk % */}
      <div className="flex items-center gap-3 mb-2 text-[10px]">
        {isLive && (
          <>
            {winningCount > 0 && <span className="text-green-400">{winningCount} winning</span>}
            {tiedCount > 0 && <span className="text-yellow-400">{tiedCount} tied</span>}
            {atRiskCount > 0 && (
              <span className="text-red-400 font-semibold">
                {atRiskCount} at risk ({riskPercent}%)
              </span>
            )}
          </>
        )}
        {isFinal && (
          <>
            {winningCount > 0 && <span className="text-green-400">{winningCount} safe</span>}
            {eliminatedCount > 0 && <span className="text-gray-400">{eliminatedCount} eliminated</span>}
          </>
        )}
      </div>
      
      <div className="space-y-0.5">
        {group.players.map(player => (
          <PlayerRow key={player.userId} player={player} />
        ))}
      </div>
    </div>
  );
}

// Game card component with Most Picked badge
function GameCard({ card, onRef }: { card: LiveEventCard; onRef?: (el: HTMLDivElement | null) => void }) {
  const isLive = card.status === 'LIVE' || card.status === 'HALFTIME';
  const isFinal = card.status === 'FINAL';
  const isPending = card.status === 'SCHEDULED';
  
  // Find most picked selection
  const mostPicked = useMemo(() => getMostPickedSelection(card), [card]);
  const mostPickedId = mostPicked?.group.selectionId;

  return (
    <div 
      ref={onRef}
      className={`
        rounded-xl border overflow-hidden transition-all scroll-mt-32
        ${isLive ? 'border-red-500/50 bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/30' : 
          isFinal ? 'border-slate-700/50 bg-slate-900/50' : 
          'border-slate-700/30 bg-slate-900/30'}
      `}
    >
      {/* Header */}
      <div className={`
        px-4 py-3 border-b 
        ${isLive ? 'border-red-500/30 bg-red-500/10' : 'border-slate-700/30'}
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isLive && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">LIVE</span>
              </div>
            )}
            {isFinal && (
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Final</span>
            )}
            {isPending && card.startTime && (
              <span className="text-xs text-blue-400">
                {new Date(card.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Users className="w-3.5 h-3.5" />
            <span>{card.totalPlayers} picks</span>
          </div>
        </div>
      </div>

      {/* Score */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Away Team */}
          <div className="flex-1">
            <div className="text-lg font-bold text-white">{card.awayTeam}</div>
          </div>
          
          {/* Score */}
          <div className="flex items-center gap-3 px-4">
            <span className={`text-3xl font-bold tabular-nums ${
              !isPending && card.awayScore > card.homeScore ? 'text-white' : 'text-white/60'
            }`}>
              {isPending ? '-' : card.awayScore}
            </span>
            <span className="text-white/30">-</span>
            <span className={`text-3xl font-bold tabular-nums ${
              !isPending && card.homeScore > card.awayScore ? 'text-white' : 'text-white/60'
            }`}>
              {isPending ? '-' : card.homeScore}
            </span>
          </div>
          
          {/* Home Team */}
          <div className="flex-1 text-right">
            <div className="text-lg font-bold text-white">{card.homeTeam}</div>
          </div>
        </div>

        {/* Period/Clock */}
        {isLive && (card.period || card.clock) && (
          <div className="text-center mt-2">
            <span className="text-sm text-red-400 font-medium">
              {card.period}{card.clock && ` · ${card.clock}`}
            </span>
          </div>
        )}
        
        {/* Tied indicator */}
        {card.isTied && isLive && (
          <div className="text-center mt-1">
            <span className="text-xs text-yellow-400 font-semibold">TIED</span>
          </div>
        )}
      </div>

      {/* Impacts */}
      <div className="px-4 pb-4">
        <div className="grid gap-3 md:grid-cols-2">
          {card.groupedImpacts.map(group => (
            <SelectionGroupCard 
              key={group.selectionId} 
              group={group} 
              gameStatus={card.status}
              isMostPicked={group.selectionId === mostPickedId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Empty state component
function EmptyState({ hasActions }: { hasActions: boolean }) {
  if (!hasActions) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-slate-600" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No picks yet</h3>
        <p className="text-sm text-white/50 max-w-sm">
          Live events will appear here once members make their picks for this period.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
        <Clock className="w-8 h-8 text-slate-600" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Nothing live right now</h3>
      <p className="text-sm text-white/50 max-w-sm">
        Check back when games are in progress to see live impacts.
      </p>
    </div>
  );
}

// Main component
export function LiveTab({ poolId, periodId }: LiveTabProps) {
  const { isDemoMode } = useDemoAuth();
  const simulator = useLiveSweatSimulator();
  const [apiCards, setApiCards] = useState<LiveEventCard[]>([]);
  const [_prevCards, setPrevCards] = useState<LiveEventCard[]>([]);
  const [hasActions, setHasActions] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shockAlerts, setShockAlerts] = useState<ShockAlert[]>([]);
  const [celebrations, setCelebrations] = useState<CelebrationEvent[]>([]);
  const [prevPlayerStatuses, setPrevPlayerStatuses] = useState<Map<string, PlayerStatus>>(new Map());
  
  // Use simulated cards when in sim mode, otherwise use API cards
  const cards = simulator.isSimMode ? (simulator.cards as LiveEventCard[]) : apiCards;
  
  // Refs for scrolling to game cards
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const fetchLiveData = useCallback(async (isAutoRefresh = false) => {
    if (!isAutoRefresh) setIsLoading(true);
    setIsRefreshing(true);
    setError(null);

    try {
      const headers: HeadersInit = {};
      if (isDemoMode) {
        headers['X-Demo-Mode'] = 'true';
      }

      const res = await fetch(`/api/live-impact/${poolId}/${periodId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch live data');

      const data = await res.json();
      const newCards = data.cards || [];
      
      // Generate shock alerts based on state changes
      if (apiCards.length > 0) {
        const newAlerts = generateShockAlerts(newCards, apiCards);
        if (newAlerts.length > 0) {
          setShockAlerts(prev => {
            // Keep recent alerts (last 60 seconds) + new ones
            const recent = prev.filter(a => Date.now() - a.timestamp < 60000);
            const combined = [...newAlerts, ...recent];
            // Dedupe by id
            const seen = new Set<string>();
            return combined.filter(a => {
              if (seen.has(a.id)) return false;
              seen.add(a.id);
              return true;
            }).slice(0, 5);
          });
        }
      }
      
      setPrevCards(apiCards);
      setApiCards(newCards);
      setHasActions(data.hasActions ?? true);
      setIsLive(data.hasLiveEvents ?? false);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Live tab fetch error:', err);
      setError('Failed to load live data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [poolId, periodId, isDemoMode, cards]);

  // Initial fetch (skip if in sim mode)
  useEffect(() => {
    if (!simulator.isSimMode) {
      fetchLiveData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, periodId, simulator.isSimMode]);
  
  // Generate shock alerts for simulated data
  useEffect(() => {
    if (simulator.isSimMode && simulator.cards) {
      const newAlerts = generateShockAlerts(simulator.cards as LiveEventCard[], _prevCards);
      if (newAlerts.length > 0) {
        setShockAlerts(prev => {
          const recent = prev.filter(a => Date.now() - a.timestamp < 60000);
          const combined = [...newAlerts, ...recent];
          const seen = new Set<string>();
          return combined.filter(a => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          }).slice(0, 5);
        });
      }
      setPrevCards(simulator.cards as LiveEventCard[]);
    }
  }, [simulator.isSimMode, simulator.cards, simulator.tickCount, _prevCards]);

  // Auto-refresh every 20 seconds when there are live events (not in sim mode)
  useEffect(() => {
    if (!isLive || simulator.isSimMode) return;

    const interval = setInterval(() => {
      fetchLiveData(true);
    }, 20000);

    return () => clearInterval(interval);
  }, [isLive, fetchLiveData, simulator.isSimMode]);

  // Track status changes and trigger celebrations
  useEffect(() => {
    if (cards.length === 0) return;

    const newStatuses = new Map<string, PlayerStatus>();
    const newCelebrations: CelebrationEvent[] = [];

    cards.forEach(card => {
      // Only trigger celebrations for games that just finished
      const isFinal = card.status === 'FINAL';
      
      card.groupedImpacts.forEach(group => {
        group.players.forEach(player => {
          const prevStatus = prevPlayerStatuses.get(player.userId);
          const currentStatus = player.status;
          newStatuses.set(player.userId, currentStatus);

          // Only celebrate on status transitions when game becomes FINAL
          if (isFinal && prevStatus && prevStatus !== currentStatus) {
            // Victory: transitioned to SAFE or WINNING
            if ((currentStatus === 'SAFE' || currentStatus === 'WINNING') && 
                prevStatus !== 'SAFE' && prevStatus !== 'WINNING') {
              newCelebrations.push({
                id: `victory-${player.userId}-${Date.now()}`,
                type: 'VICTORY',
                playerName: player.displayName,
                teamName: group.selectionLabel,
                timestamp: Date.now(),
              });
            }
            // Elimination: transitioned to ELIMINATED
            else if (currentStatus === 'ELIMINATED' && prevStatus !== 'ELIMINATED') {
              newCelebrations.push({
                id: `elim-${player.userId}-${Date.now()}`,
                type: 'ELIMINATION',
                playerName: player.displayName,
                teamName: group.selectionLabel,
                timestamp: Date.now(),
              });
            }
          }
        });
      });
    });

    setPrevPlayerStatuses(newStatuses);

    // Add new celebrations to queue (limit to avoid overwhelming)
    if (newCelebrations.length > 0) {
      setCelebrations(prev => [...prev, ...newCelebrations.slice(0, 3)]);
    }
  }, [cards, prevPlayerStatuses]);

  // Handle celebration complete
  const handleCelebrationComplete = useCallback((id: string) => {
    setCelebrations(prev => prev.filter(c => c.id !== id));
  }, []);

  // Compute pool-wide stats
  const poolStats = useMemo(() => computePoolStats(cards), [cards]);

  // Handle alert click - scroll to game card
  const handleAlertClick = useCallback((eventId: string) => {
    const ref = cardRefs.current.get(eventId);
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash the card
      ref.classList.add('ring-2', 'ring-amber-500');
      setTimeout(() => {
        ref.classList.remove('ring-2', 'ring-amber-500');
      }, 2000);
    }
  }, []);

  // Set card ref
  const setCardRef = useCallback((eventId: string, element: HTMLDivElement | null) => {
    if (element) {
      cardRefs.current.set(eventId, element);
    } else {
      cardRefs.current.delete(eventId);
    }
  }, []);

  // Skip loading state if in sim mode
  if (isLoading && !simulator.isSimMode) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 text-white/50 animate-spin" />
      </div>
    );
  }

  // Skip error state if in sim mode
  if (error && !simulator.isSimMode) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <WifiOff className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Connection Error</h3>
        <p className="text-sm text-white/50 mb-4">{error}</p>
        <button
          onClick={() => fetchLiveData()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show sim toggle when in demo mode (even when no cards)
  const simModeToggle = isDemoMode && (
    <div className="mb-4">
      <button
        onClick={() => simulator.toggleSimMode(!simulator.isSimMode)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          simulator.isSimMode 
            ? 'bg-purple-600/20 border-purple-500/50 text-purple-300' 
            : 'bg-slate-800 border-slate-700 text-white/70 hover:bg-slate-700'
        }`}
      >
        <FlaskConical className="w-4 h-4" />
        <span className="text-sm font-medium">
          {simulator.isSimMode ? 'Demo Live Mode ON' : 'Enable Demo Live Mode'}
        </span>
      </button>
    </div>
  );

  if (cards.length === 0 && !simulator.isSimMode) {
    return (
      <>
        {simModeToggle}
        <EmptyState hasActions={hasActions} />
      </>
    );
  }

  // Separate live/final games
  const liveGames = cards.filter(c => c.status === 'LIVE' || c.status === 'HALFTIME');
  const finalGames = cards.filter(c => c.status === 'FINAL');
  const pendingGames = cards.filter(c => c.status === 'SCHEDULED');
  
  const hasLiveEvents = liveGames.length > 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Celebration Overlays */}
      <CelebrationManager 
        events={celebrations} 
        onEventComplete={handleCelebrationComplete} 
      />
      
      {/* Demo Mode Toggle */}
      {simModeToggle}
      
      {/* Simulation Controls (only when sim mode is ON) */}
      {simulator.isSimMode && <SimControlsPanel simulator={simulator} />}
      
      {/* Live Alerts Strip */}
      <LiveAlertsStrip 
        stats={poolStats}
        alerts={shockAlerts}
        hasLiveEvents={hasLiveEvents}
        onAlertClick={handleAlertClick}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isLive ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-gray-400" />
            )}
            <span className={`text-xs ${isLive ? 'text-green-400' : 'text-gray-400'}`}>
              {isLive ? 'Live updates active' : 'No live games'}
            </span>
          </div>
        </div>
        <button
          onClick={() => fetchLiveData()}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>
            {isRefreshing ? 'Updating...' : `Updated ${lastRefresh.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          </span>
        </button>
      </div>

      {/* Live Games */}
      {liveGames.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Now</h3>
            <span className="text-xs text-white/40">({liveGames.length})</span>
          </div>
          <div className="space-y-4">
            {liveGames.map(card => (
              <GameCard 
                key={card.eventId} 
                card={card} 
                onRef={(el) => setCardRef(card.eventId, el)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Final Games */}
      {finalGames.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Final</h3>
            <span className="text-xs text-white/40">({finalGames.length})</span>
          </div>
          <div className="space-y-4">
            {finalGames.map(card => (
              <GameCard 
                key={card.eventId} 
                card={card}
                onRef={(el) => setCardRef(card.eventId, el)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending Games */}
      {pendingGames.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Upcoming</h3>
            <span className="text-xs text-white/40">({pendingGames.length})</span>
          </div>
          <div className="space-y-4">
            {pendingGames.map(card => (
              <GameCard 
                key={card.eventId} 
                card={card}
                onRef={(el) => setCardRef(card.eventId, el)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveTab;
