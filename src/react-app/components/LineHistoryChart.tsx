/**
 * Line History Chart - Visualizes odds movement over time
 * 
 * Shows spread, total, and moneyline movements with Recharts
 */

import { useState, memo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

interface LineHistoryPoint {
  timestamp: string;
  spread: number;
  total: number;
  mlHome: number;
  mlAway: number;
}

interface LineHistoryChartProps {
  data: LineHistoryPoint[];
  openSpread?: number;
  openTotal?: number;
  homeTeam?: string;
  awayTeam?: string;
}

type ChartMode = 'spread' | 'total' | 'moneyline';

const ChartModeButton = memo(function ChartModeButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
        active
          ? "bg-primary text-white"
          : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
      )}
    >
      {children}
    </button>
  );
});

export const LineHistoryChart = memo(function LineHistoryChart({
  data,
  openSpread,
  openTotal,
  homeTeam = 'Home',
  awayTeam = 'Away'
}: LineHistoryChartProps) {
  const [mode, setMode] = useState<ChartMode>('spread');

  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-white/40 text-sm">
        No line history available
      </div>
    );
  }

  // Format data for charts
  const chartData = data.map((point, idx) => ({
    ...point,
    time: new Date(point.timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }),
    idx
  }));

  // Calculate movement summary
  const first = data[0];
  const last = data[data.length - 1];
  const spreadChange = last.spread - first.spread;
  const totalChange = last.total - first.total;

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const point = payload[0].payload;
    
    return (
      <div className="bg-[hsl(220,18%,13%)] border border-white/10 rounded-lg p-3 shadow-xl">
        <div className="text-xs text-white/50 mb-2">{label}</div>
        {mode === 'spread' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60 text-xs">{homeTeam}</span>
              <span className={cn(
                "font-mono font-semibold",
                point.spread < 0 ? "text-emerald-400" : "text-white"
              )}>
                {point.spread > 0 ? '+' : ''}{point.spread.toFixed(1)}
              </span>
            </div>
          </div>
        )}
        {mode === 'total' && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-white/60 text-xs">Total</span>
            <span className="font-mono font-semibold text-white">
              {point.total.toFixed(1)}
            </span>
          </div>
        )}
        {mode === 'moneyline' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60 text-xs">{homeTeam}</span>
              <span className={cn(
                "font-mono font-semibold",
                point.mlHome < 0 ? "text-emerald-400" : "text-amber-400"
              )}>
                {point.mlHome > 0 ? '+' : ''}{point.mlHome}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/60 text-xs">{awayTeam}</span>
              <span className={cn(
                "font-mono font-semibold",
                point.mlAway < 0 ? "text-emerald-400" : "text-amber-400"
              )}>
                {point.mlAway > 0 ? '+' : ''}{point.mlAway}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const getYDomain = () => {
    if (mode === 'spread') {
      const spreads = data.map(d => d.spread);
      const min = Math.min(...spreads);
      const max = Math.max(...spreads);
      const padding = Math.max(1, (max - min) * 0.2);
      return [Math.floor(min - padding), Math.ceil(max + padding)];
    }
    if (mode === 'total') {
      const totals = data.map(d => d.total);
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      const padding = Math.max(1, (max - min) * 0.2);
      return [Math.floor(min - padding), Math.ceil(max + padding)];
    }
    // Moneyline
    const mls = data.flatMap(d => [d.mlHome, d.mlAway]);
    const min = Math.min(...mls);
    const max = Math.max(...mls);
    const padding = Math.max(20, (max - min) * 0.1);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex items-center gap-2">
        <ChartModeButton active={mode === 'spread'} onClick={() => setMode('spread')}>
          Spread
        </ChartModeButton>
        <ChartModeButton active={mode === 'total'} onClick={() => setMode('total')}>
          Total
        </ChartModeButton>
        <ChartModeButton active={mode === 'moneyline'} onClick={() => setMode('moneyline')}>
          Moneyline
        </ChartModeButton>
      </div>

      {/* Movement summary */}
      <div className="flex items-center gap-4 text-sm">
        {mode === 'spread' && (
          <MovementBadge
            label="Spread"
            change={spreadChange}
            suffix="pts"
            invertColor
          />
        )}
        {mode === 'total' && (
          <MovementBadge
            label="Total"
            change={totalChange}
            suffix="pts"
          />
        )}
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={getYDomain()}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickFormatter={(val) => mode === 'moneyline' ? val : val.toFixed(1)}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Opening line reference */}
            {mode === 'spread' && openSpread !== undefined && (
              <ReferenceLine
                y={openSpread}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="5 5"
                label={{ value: 'Open', fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
              />
            )}
            {mode === 'total' && openTotal !== undefined && (
              <ReferenceLine
                y={openTotal}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="5 5"
                label={{ value: 'Open', fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
              />
            )}

            {mode === 'spread' && (
              <Line
                type="stepAfter"
                dataKey="spread"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
              />
            )}
            {mode === 'total' && (
              <Line
                type="stepAfter"
                dataKey="total"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#f59e0b' }}
              />
            )}
            {mode === 'moneyline' && (
              <>
                <Line
                  type="stepAfter"
                  dataKey="mlHome"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981' }}
                  name={homeTeam}
                />
                <Line
                  type="stepAfter"
                  dataKey="mlAway"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#ef4444' }}
                  name={awayTeam}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend for moneyline */}
      {mode === 'moneyline' && (
        <div className="flex items-center justify-center gap-6 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-emerald-500 rounded" />
            <span className="text-white/50">{homeTeam}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-red-500 rounded" />
            <span className="text-white/50">{awayTeam}</span>
          </div>
        </div>
      )}
    </div>
  );
});

// Movement badge component
function MovementBadge({
  label,
  change,
  suffix,
  invertColor = false
}: {
  label: string;
  change: number;
  suffix: string;
  invertColor?: boolean;
}) {
  const isPositive = invertColor ? change < 0 : change > 0;
  const isNegative = invertColor ? change > 0 : change < 0;
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/40">{label}:</span>
      <div className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        isPositive && "bg-emerald-500/10 text-emerald-400",
        isNegative && "bg-red-500/10 text-red-400",
        !isPositive && !isNegative && "bg-white/5 text-white/50"
      )}>
        {isPositive && <TrendingUp className="w-3 h-3" />}
        {isNegative && <TrendingDown className="w-3 h-3" />}
        {!isPositive && !isNegative && <Minus className="w-3 h-3" />}
        <span>{Math.abs(change).toFixed(1)} {suffix}</span>
      </div>
    </div>
  );
}

export default LineHistoryChart;
