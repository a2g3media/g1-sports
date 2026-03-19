/**
 * OddsComparisonTable - Multi-sportsbook odds comparison display
 * Shows spread, total, and moneyline across multiple sportsbooks
 */

import { useState, useEffect, useRef } from 'react';
import { useDemoAuth } from '../contexts/DemoAuthContext';
import { Sparkles, TrendingUp, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface Sportsbook {
  id: string;
  name: string;
  shortName: string;
  color: string;
}

interface SportsbookOdds {
  sportsbook: Sportsbook;
  spread: number | null;
  spreadOdds: number | null;
  total: number | null;
  overOdds: number | null;
  underOdds: number | null;
  homeML: number | null;
  awayML: number | null;
}

interface GameOdds {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  startTime?: string;
  status?: string;
  odds: SportsbookOdds[];
}

interface ComparisonData {
  sport: string;
  date: string;
  sportsbooks: Sportsbook[];
  games: GameOdds[];
  fetchedAt: string;
}

interface OddsComparisonTableProps {
  sport: string;
  date?: string;
  onGameSelect?: (gameId: string) => void;
}

// Format odds display
function formatOdds(odds: number | null): string {
  if (odds === null) return '-';
  return odds > 0 ? `+${odds}` : odds.toString();
}

// Format spread display
function formatSpread(spread: number | null): string {
  if (spread === null) return '-';
  return spread > 0 ? `+${spread}` : spread.toString();
}

// Check if this is the best odds in the row
function isBestOdds(value: number | null, allValues: (number | null)[], type: 'high' | 'low' = 'high'): boolean {
  if (value === null) return false;
  const validValues = allValues.filter((v): v is number => v !== null);
  if (validValues.length === 0) return false;
  
  if (type === 'high') {
    return value === Math.max(...validValues);
  }
  return value === Math.min(...validValues);
}

// OddsCell with highlight for best value
function OddsCell({ 
  value, 
  isBest, 
  color: _color,
  subValue
}: { 
  value: string; 
  isBest: boolean; 
  color: string;
  subValue?: string;
}) {
  return (
    <div className={`
      px-2 py-1.5 text-center rounded transition-all
      ${isBest ? 'ring-2 ring-emerald-400 bg-emerald-500/20' : 'bg-white/5'}
    `}>
      <div className={`font-mono text-sm font-semibold ${isBest ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-zinc-500 font-mono">{subValue}</div>
      )}
    </div>
  );
}

// Sportsbook header with logo/color
function SportsbookHeader({ sportsbook }: { sportsbook: Sportsbook }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div 
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-lg"
        style={{ backgroundColor: sportsbook.color }}
      >
        {sportsbook.shortName.slice(0, 2)}
      </div>
      <span className="text-[10px] text-zinc-400 font-medium">{sportsbook.shortName}</span>
    </div>
  );
}

// Single game row in the comparison table
function GameRow({ 
  game, 
  sportsbooks,
  expanded,
  onToggle,
  onSelect
}: { 
  game: GameOdds; 
  sportsbooks: Sportsbook[];
  expanded: boolean;
  onToggle: () => void;
  onSelect?: () => void;
}) {
  const spreadOdds = game.odds.map(o => o.spreadOdds);
  const totals = game.odds.map(o => o.overOdds);
  const homeMLs = game.odds.map(o => o.homeML);
  const awayMLs = game.odds.map(o => o.awayML);

  return (
    <div className="border-b border-white/5 last:border-0">
      {/* Game header */}
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className="font-semibold text-white">{game.awayTeam} @ {game.homeTeam}</div>
            <div className="text-xs text-zinc-500">
              {game.status === 'InProgress' ? (
                <span className="text-emerald-400 font-medium">● LIVE</span>
              ) : game.startTime ? (
                new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              ) : 'Scheduled'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-500/10"
            >
              Details
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {/* Expanded odds grid */}
      {expanded && (
        <div className="px-3 pb-3">
          {/* Spread row */}
          <div className="mb-2">
            <div className="text-xs text-zinc-500 mb-1 font-medium">SPREAD</div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${sportsbooks.length}, 1fr)` }}>
              {game.odds.map((o, idx) => (
                <OddsCell
                  key={`spread-${idx}`}
                  value={formatSpread(o.spread)}
                  subValue={formatOdds(o.spreadOdds)}
                  isBest={isBestOdds(o.spreadOdds, spreadOdds)}
                  color={o.sportsbook.color}
                />
              ))}
            </div>
          </div>

          {/* Total row */}
          <div className="mb-2">
            <div className="text-xs text-zinc-500 mb-1 font-medium">TOTAL</div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${sportsbooks.length}, 1fr)` }}>
              {game.odds.map((o, idx) => (
                <OddsCell
                  key={`total-${idx}`}
                  value={o.total !== null ? `O${o.total}` : '-'}
                  subValue={formatOdds(o.overOdds)}
                  isBest={isBestOdds(o.overOdds, totals)}
                  color={o.sportsbook.color}
                />
              ))}
            </div>
          </div>

          {/* Moneyline rows */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-zinc-500 mb-1 font-medium">{game.homeTeam} ML</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${sportsbooks.length}, 1fr)` }}>
                {game.odds.map((o, idx) => (
                  <OddsCell
                    key={`homeML-${idx}`}
                    value={formatOdds(o.homeML)}
                    isBest={isBestOdds(o.homeML, homeMLs)}
                    color={o.sportsbook.color}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1 font-medium">{game.awayTeam} ML</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${sportsbooks.length}, 1fr)` }}>
                {game.odds.map((o, idx) => (
                  <OddsCell
                    key={`awayML-${idx}`}
                    value={formatOdds(o.awayML)}
                    isBest={isBestOdds(o.awayML, awayMLs)}
                    color={o.sportsbook.color}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OddsComparisonTable({ sport, date, onGameSelect }: OddsComparisonTableProps) {
  const { isDemoMode } = useDemoAuth();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGames, setExpandedGames] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const dateParam = date || new Date().toISOString().split('T')[0];
      const response = await fetch(
        `/api/sportsbook-odds/compare?sport=${sport}&date=${dateParam}`,
        {
          headers: isDemoMode ? { 'X-Demo-Mode': 'true' } : {},
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch odds comparison');
      }

      const result = await response.json();
      setData(result);
      setLastRefresh(new Date());
      
      // Auto-expand first game
      if (result.games?.length > 0 && expandedGames.size === 0) {
        setExpandedGames(new Set([result.games[0].gameId]));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Error count ref for backoff
  const errorCountRef = useRef(0);

  useEffect(() => {
    fetchData();
    
    // Polling with exponential backoff
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const BASE_INTERVAL = 60000;
    const MAX_BACKOFF = 240000;
    
    const pollWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        await fetchData();
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(BASE_INTERVAL * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    timeoutId = setTimeout(pollWithBackoff, BASE_INTERVAL);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [sport, date, isDemoMode]);

  const toggleGame = (gameId: string) => {
    setExpandedGames(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  };

  if (loading && !data) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur rounded-xl border border-white/10 p-6">
        <div className="flex items-center justify-center gap-3 text-zinc-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading odds comparison...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur rounded-xl border border-red-500/30 p-6">
        <div className="text-center text-red-400">
          <p className="mb-2">Failed to load odds</p>
          <button 
            onClick={fetchData}
            className="text-sm text-blue-400 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.games.length === 0) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur rounded-xl border border-white/10 p-6">
        <div className="text-center text-zinc-500">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No games with odds available for {sport}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/80 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-white">Odds Comparison</span>
          <span className="text-xs text-zinc-500 px-2 py-0.5 bg-zinc-800 rounded">
            {data.games.length} games
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            Updated {lastRefresh.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
          <button 
            onClick={fetchData}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sportsbook headers */}
      <div className="px-4 py-2 border-b border-white/5 bg-zinc-800/50">
        <div className="flex items-center gap-4">
          <div className="w-32 flex-shrink-0"></div>
          <div 
            className="flex-1 grid gap-1" 
            style={{ gridTemplateColumns: `repeat(${data.sportsbooks.length}, 1fr)` }}
          >
            {data.sportsbooks.map(sb => (
              <SportsbookHeader key={sb.id} sportsbook={sb} />
            ))}
          </div>
        </div>
      </div>

      {/* Games list */}
      <div className="max-h-[600px] overflow-y-auto">
        {data.games.map(game => (
          <GameRow
            key={game.gameId}
            game={game}
            sportsbooks={data.sportsbooks}
            expanded={expandedGames.has(game.gameId)}
            onToggle={() => toggleGame(game.gameId)}
            onSelect={onGameSelect ? () => onGameSelect(game.gameId) : undefined}
          />
        ))}
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 border-t border-white/5 bg-zinc-800/30">
        <p className="text-[10px] text-zinc-500 text-center">
          <span className="text-emerald-400">●</span> Green highlight = best available odds
        </p>
      </div>
    </div>
  );
}

export default OddsComparisonTable;
