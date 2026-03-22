/**
 * Odds Intelligence Panel
 * Premium odds display with Market Snapshot, Line Movement, and Market Signals
 */

import { memo, useMemo } from "react";
import { 
  TrendingUp, TrendingDown, DollarSign, Activity, 
  Users, BarChart3, AlertTriangle, Zap, Clock
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";
import { useOddsFormat } from "@/react-app/hooks/useOddsFormat";
import { CoachGBettingIntel } from "./CoachGBettingIntel";
import { getMarketPeriodLabels } from "@/react-app/lib/marketPeriodLabels";

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
}

interface LineHistoryPoint {
  timestamp: string;
  spread: number | null;
  total: number | null;
  mlHome?: number | null;
  mlAway?: number | null;
}

interface OddsIntelligencePanelProps {
  gameId: string;
  sport?: string;
  odds?: OddsData;
  lineHistory?: LineHistoryPoint[];
  publicBetHome?: number;
  publicBetAway?: number;
  homeTeam: string;
  awayTeam: string;
  status: 'LIVE' | 'SCHEDULED' | 'FINAL';
}

// ====================
// HELPERS
// ====================

function getMovementDirection(current: number | undefined, open: number | undefined): 'up' | 'down' | 'none' {
  if (current === undefined || open === undefined) return 'none';
  if (Math.abs(current - open) < 0.01) return 'none';
  return current > open ? 'up' : 'down';
}

function getMovementAmount(current: number | undefined, open: number | undefined): number {
  if (current === undefined || open === undefined) return 0;
  return Math.abs(current - open);
}

// ====================
// SUB-COMPONENTS
// ====================

// Market Block - Large display for a single market
const MarketBlock = memo(function MarketBlock({
  label,
  value,
  openValue,
  formatter,
  className,
}: {
  label: string;
  value: number | undefined;
  openValue?: number;
  formatter: (v: number) => string;
  className?: string;
}) {
  const direction = getMovementDirection(value, openValue);
  const movement = getMovementAmount(value, openValue);
  
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-5",
      "bg-gradient-to-br from-white/[0.04] to-white/[0.01]",
      "border border-white/[0.06]",
      direction === 'up' && "border-emerald-500/30 shadow-lg shadow-emerald-500/5",
      direction === 'down' && "border-rose-500/30 shadow-lg shadow-rose-500/5",
      className
    )}>
      {/* Background glow */}
      {direction !== 'none' && (
        <div className={cn(
          "absolute inset-0 opacity-10",
          direction === 'up' ? "bg-gradient-to-br from-emerald-500/20 to-transparent" : "bg-gradient-to-br from-rose-500/20 to-transparent"
        )} />
      )}
      
      <div className="relative">
        {/* Label */}
        <div className="text-xs text-white/40 uppercase tracking-widest font-medium mb-2">
          {label}
        </div>
        
        {/* Value */}
        <div className="text-3xl font-bold text-white tracking-tight">
          {value !== undefined ? formatter(value) : '—'}
        </div>
        
        {/* Movement indicator */}
        {direction !== 'none' && movement > 0 && (
          <div className={cn(
            "flex items-center gap-1.5 mt-2 text-sm font-medium",
            direction === 'up' ? "text-emerald-400" : "text-rose-400"
          )}>
            {direction === 'up' ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            <span>
              {movement.toFixed(1)} from {openValue !== undefined ? formatter(openValue) : '—'}
            </span>
          </div>
        )}
        
        {/* Open value when no movement */}
        {direction === 'none' && openValue !== undefined && (
          <div className="text-xs text-white/30 mt-2">
            Open: {formatter(openValue)}
          </div>
        )}
      </div>
    </div>
  );
});

// Mini Line Chart - Simple sparkline for line history
const MiniLineChart = memo(function MiniLineChart({
  data,
  valueKey,
  color,
  height = 40,
}: {
  data: LineHistoryPoint[];
  valueKey: 'spread' | 'total';
  color: string;
  height?: number;
}) {
  const points = useMemo(() => {
    if (data.length < 2) return null;

    const filtered = data.filter((d) => d[valueKey] !== null);
    if (filtered.length < 2) return null;

    const values = filtered.map((d) => d[valueKey] as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    const width = 100;
    const padding = 4;
    
    return filtered.map((d, i) => {
      const value = d[valueKey] as number;
      const x = padding + (i / (filtered.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return { x, y, value, time: d.timestamp };
    });
  }, [data, valueKey, height]);
  
  if (!points || points.length < 2) {
    return (
      <div className="h-10 flex items-center justify-center text-xs text-white/30">
        Not enough data
      </div>
    );
  }
  
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  return (
    <svg 
      viewBox={`0 0 100 ${height}`} 
      className="w-full"
      style={{ height }}
    >
      {/* Grid lines */}
      <line x1="4" y1={height/2} x2="96" y2={height/2} stroke="white" strokeOpacity="0.05" />
      
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Start and end dots */}
      <circle cx={points[0].x} cy={points[0].y} r="3" fill={color} fillOpacity="0.5" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" fill={color} />
    </svg>
  );
});

// Market Signals Section
const MarketSignals = memo(function MarketSignals({
  publicBetHome,
  publicBetAway,
  homeTeam,
  awayTeam,
  spreadMovement,
  totalMovement,
}: {
  publicBetHome?: number;
  publicBetAway?: number;
  homeTeam: string;
  awayTeam: string;
  spreadMovement: 'up' | 'down' | 'none';
  totalMovement: 'up' | 'down' | 'none';
}) {
  // Calculate if there's a reverse line movement signal
  // RLM = public betting one way, line moving the other
  const hasRLM = useMemo(() => {
    if (!publicBetHome || spreadMovement === 'none') return false;
    const publicFavorsHome = publicBetHome > 55;
    const publicFavorsAway = (publicBetAway || (100 - publicBetHome)) > 55;
    // If public favors home but spread moved against them (down = home spread worse)
    // or public favors away but spread moved for home (up = home spread better)
    return (publicFavorsHome && spreadMovement === 'down') || 
           (publicFavorsAway && spreadMovement === 'up');
  }, [publicBetHome, publicBetAway, spreadMovement]);
  
  const homePercent = publicBetHome || 50;
  const awayPercent = publicBetAway || (100 - homePercent);
  
  return (
    <div className="space-y-4">
      {/* Public Betting Split */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-white/50 uppercase tracking-wide font-medium">Public Betting</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-white/70">{awayTeam}</span>
              <span className="font-bold text-white">{awayPercent.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                style={{ width: `${awayPercent}%` }}
              />
            </div>
          </div>
          <div className="text-white/20 text-xs">vs</div>
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-white/70">{homeTeam}</span>
              <span className="font-bold text-white">{homePercent.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${homePercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Sharp Money / RLM Indicator */}
      {hasRLM && (
        <div className="rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-amber-400">Reverse Line Movement</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">SHARP</span>
              </div>
              <p className="text-xs text-white/50 mt-1">
                Line moving opposite to public betting — potential sharp action detected
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Line Movement Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
          <div className="text-xs text-white/40 mb-1">Spread Move</div>
          <div className={cn(
            "flex items-center gap-1.5 text-sm font-medium",
            spreadMovement === 'up' && "text-emerald-400",
            spreadMovement === 'down' && "text-rose-400",
            spreadMovement === 'none' && "text-white/50"
          )}>
            {spreadMovement === 'up' && <TrendingUp className="w-4 h-4" />}
            {spreadMovement === 'down' && <TrendingDown className="w-4 h-4" />}
            {spreadMovement === 'none' && <Activity className="w-4 h-4" />}
            <span>{spreadMovement === 'none' ? 'No movement' : spreadMovement === 'up' ? 'Toward Home' : 'Toward Away'}</span>
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
          <div className="text-xs text-white/40 mb-1">Total Move</div>
          <div className={cn(
            "flex items-center gap-1.5 text-sm font-medium",
            totalMovement === 'up' && "text-emerald-400",
            totalMovement === 'down' && "text-rose-400",
            totalMovement === 'none' && "text-white/50"
          )}>
            {totalMovement === 'up' && <TrendingUp className="w-4 h-4" />}
            {totalMovement === 'down' && <TrendingDown className="w-4 h-4" />}
            {totalMovement === 'none' && <Activity className="w-4 h-4" />}
            <span>{totalMovement === 'none' ? 'No movement' : totalMovement === 'up' ? 'Higher' : 'Lower'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ====================
// MAIN COMPONENT
// ====================

export const OddsIntelligencePanel = memo(function OddsIntelligencePanel({
  gameId,
  sport,
  odds,
  lineHistory,
  publicBetHome,
  publicBetAway,
  homeTeam,
  awayTeam,
  status,
}: OddsIntelligencePanelProps) {
  const { formatMoneylineValue, formatSpreadValue } = useOddsFormat();
  
  const formatSpread = (spread: number): string => formatSpreadValue(spread);
  const formatMoneyline = (ml: number): string => formatMoneylineValue(ml);
  const formatTotal = (total: number): string => total.toFixed(1);
  const periodLabels = getMarketPeriodLabels(sport);
  
  const spreadMovement = getMovementDirection(odds?.spread, odds?.openSpread);
  const totalMovement = getMovementDirection(odds?.total, odds?.openTotal);
  
  if (!odds) {
    return (
      <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8 text-center">
        <DollarSign className="w-12 h-12 text-white/20 mx-auto mb-3" />
        <p className="text-white/50 font-medium">Odds not available yet</p>
        <p className="text-white/30 text-sm mt-1">Check back closer to game time</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Market Snapshot</h3>
            <p className="text-xs text-white/40">Real-time odds intelligence</p>
          </div>
        </div>
        {status === 'LIVE' && (
          <span className="px-2 py-1 rounded-md bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wide animate-pulse">
            LIVE ODDS
          </span>
        )}
      </div>
      
      {/* Market Blocks - Main Odds Display */}
      <div className="grid grid-cols-3 gap-3">
        <MarketBlock
          label="Spread"
          value={odds.spread}
          openValue={odds.openSpread}
          formatter={formatSpread}
        />
        <MarketBlock
          label="Total"
          value={odds.total}
          openValue={odds.openTotal}
          formatter={formatTotal}
        />
        <MarketBlock
          label="ML Home"
          value={odds.mlHome}
          openValue={odds.openMlHome}
          formatter={formatMoneyline}
        />
      </div>
      
      {/* Moneyline Both Teams */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
        <div className="text-xs text-white/40 uppercase tracking-wide font-medium mb-3">Moneyline</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-xs text-white/50 mb-1">{awayTeam}</div>
            <div className="text-2xl font-bold text-white">
              {odds.mlAway !== undefined ? formatMoneyline(odds.mlAway) : '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/50 mb-1">{homeTeam}</div>
            <div className="text-2xl font-bold text-white">
              {odds.mlHome !== undefined ? formatMoneyline(odds.mlHome) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Sport-specific derivative markets */}
      {(odds.spread1HHome != null || odds.total1H != null || odds.ml1HHome != null || odds.ml1HAway != null) && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.08] p-4">
          <div className="text-xs text-violet-300/90 uppercase tracking-wide font-medium mb-3">{periodLabels.section}</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase mb-1">Spread</div>
              <div className="text-lg font-bold text-white">
                {odds.spread1HHome != null ? formatSpread(odds.spread1HHome) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase mb-1">Total</div>
              <div className="text-lg font-bold text-white">
                {odds.total1H != null ? formatTotal(odds.total1H) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase mb-1">Moneyline</div>
              <div className="text-sm font-bold text-white">
                {odds.ml1HAway != null ? formatMoneyline(odds.ml1HAway) : '—'} / {odds.ml1HHome != null ? formatMoneyline(odds.ml1HHome) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Line Movement Section */}
      {lineHistory && lineHistory.length >= 2 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-white/50 uppercase tracking-wide font-medium">Line Movement</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/40 mb-2">Spread</div>
              <MiniLineChart data={lineHistory} valueKey="spread" color="#22d3ee" />
              <div className="flex items-center justify-between mt-2 text-[10px] text-white/30">
                <span>Open: {lineHistory[0].spread !== null ? formatSpread(lineHistory[0].spread) : '—'}</span>
                <span>Now: {(() => {
                  const spread = lineHistory[lineHistory.length - 1]?.spread;
                  return spread !== null && spread !== undefined ? formatSpread(spread) : '—';
                })()}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-2">Total</div>
              <MiniLineChart data={lineHistory} valueKey="total" color="#a78bfa" />
              <div className="flex items-center justify-between mt-2 text-[10px] text-white/30">
                <span>Open: {lineHistory[0].total ?? '—'}</span>
                <span>Now: {lineHistory[lineHistory.length - 1].total ?? '—'}</span>
              </div>
            </div>
          </div>
          
          {/* Timeline markers */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
            <div className="flex items-center gap-1 text-[10px] text-white/30">
              <Clock className="w-3 h-3" />
              <span>
                {new Date(lineHistory[0].timestamp).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>
            </div>
            <div className="text-[10px] text-white/30">
              {lineHistory.length} updates tracked
            </div>
          </div>
        </div>
      )}
      
      {/* Market Signals */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-white/50 uppercase tracking-wide font-medium">Market Signals</span>
        </div>
        <MarketSignals
          publicBetHome={publicBetHome}
          publicBetAway={publicBetAway}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          spreadMovement={spreadMovement}
          totalMovement={totalMovement}
        />
      </div>
      
      {/* Coach G Betting Intel */}
      <CoachGBettingIntel
        gameId={gameId}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        spread={odds.spread}
        total={odds.total}
        mlHome={odds.mlHome}
        mlAway={odds.mlAway}
        status={status}
        publicBetHome={publicBetHome}
      />
      
      {/* Disclaimer */}
      <div className="text-[10px] text-white/20 text-center pt-2">
        Odds are for informational purposes only. Lines may vary by sportsbook.
      </div>
    </div>
  );
});

export default OddsIntelligencePanel;
