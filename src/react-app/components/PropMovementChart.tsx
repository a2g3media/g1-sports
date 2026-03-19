import { useState, useEffect, memo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

interface PropHistoryPoint {
  line_value: number;
  recorded_at: string;
}

interface PropMovementData {
  player_name: string;
  prop_type: string;
  team: string | null;
  open_line: number | null;
  current_line: number | null;
  movement: number | null;
  history: PropHistoryPoint[];
}

interface PropMovementResponse {
  game_id: number;
  lookback_days: number;
  cutoff_date: string;
  props: PropMovementData[];
  total_datapoints: number;
}

interface PropMovementChartProps {
  gameId: string;
  playerName: string;
  propType: string;
  currentLine: number;
  className?: string;
}



// Custom tooltip for the chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-white font-semibold">{data.line_value}</p>
        <p className="text-white/50 text-xs">
          {new Date(data.recorded_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })}
        </p>
      </div>
    );
  }
  return null;
};

// Movement badge component
const MovementBadge = memo(function MovementBadge({ 
  movement, 
  size = 'sm' 
}: { 
  movement: number | null; 
  size?: 'sm' | 'md';
}) {
  if (movement === null || movement === 0) {
    return (
      <span className={cn(
        "inline-flex items-center gap-0.5 text-slate-400",
        size === 'sm' ? 'text-xs' : 'text-sm'
      )}>
        <Minus className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
        <span>No change</span>
      </span>
    );
  }
  
  const isPositive = movement > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 font-medium",
      isPositive ? 'text-emerald-400' : 'text-rose-400',
      size === 'sm' ? 'text-xs' : 'text-sm'
    )}>
      {isPositive ? (
        <TrendingUp className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      ) : (
        <TrendingDown className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      )}
      <span>{isPositive ? '+' : ''}{movement.toFixed(1)}</span>
    </span>
  );
});

// Main chart component
export const PropMovementChart = memo(function PropMovementChart({
  gameId,
  playerName,
  propType,
  currentLine,
  className
}: PropMovementChartProps) {
  const [data, setData] = useState<PropMovementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchMovement = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Extract numeric ID from gameId (e.g., "sdio_nba_12345" -> "12345")
        const numericId = gameId.replace(/^sdio_[a-z]+_/, '');
        
        const params = new URLSearchParams();
        params.set('player', playerName);
        params.set('prop_type', propType);
        
        const res = await fetch(`/api/sports-data/props/${numericId}/movement?${params}`);
        if (!res.ok) throw new Error('Failed to fetch movement data');
        
        const json: PropMovementResponse = await res.json();
        
        // Find the matching prop
        const prop = json.props.find(
          p => p.player_name === playerName && p.prop_type === propType
        );
        
        setData(prop || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    
    fetchMovement();
  }, [gameId, playerName, propType]);
  
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-6", className)}>
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span className="ml-2 text-white/50 text-sm">Loading movement...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={cn("text-center py-4 text-rose-400 text-sm", className)}>
        {error}
      </div>
    );
  }
  
  if (!data || data.history.length < 2) {
    return (
      <div className={cn("text-center py-4 text-white/40 text-sm", className)}>
        Not enough data for movement chart
      </div>
    );
  }
  
  // Prepare chart data with formatted timestamps
  const chartData = data.history.map(point => ({
    ...point,
    timestamp: new Date(point.recorded_at).getTime()
  }));
  
  // Calculate Y-axis domain with padding
  const lineValues = chartData.map(d => d.line_value);
  const minLine = Math.min(...lineValues);
  const maxLine = Math.max(...lineValues);
  const padding = (maxLine - minLine) * 0.2 || 0.5;
  
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with stats */}
      <div className="flex items-center justify-between px-2">
        <div>
          <span className="text-white/50 text-xs">Opening</span>
          <span className="ml-2 text-white font-semibold">
            {data.open_line ?? '—'}
          </span>
        </div>
        <MovementBadge movement={data.movement} size="md" />
        <div>
          <span className="text-white/50 text-xs">Current</span>
          <span className="ml-2 text-white font-semibold">
            {data.current_line ?? currentLine}
          </span>
        </div>
      </div>
      
      {/* Chart */}
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis 
              dataKey="timestamp" 
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <YAxis 
              domain={[minLine - padding, maxLine + padding]}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            {data.open_line !== null && (
              <ReferenceLine 
                y={data.open_line} 
                stroke="rgba(255,255,255,0.2)" 
                strokeDasharray="4 4"
                label={{ 
                  value: 'Open', 
                  fill: 'rgba(255,255,255,0.3)', 
                  fontSize: 10,
                  position: 'left'
                }}
              />
            )}
            <Line
              type="stepAfter"
              dataKey="line_value"
              stroke={data.movement !== null && data.movement > 0 ? '#10b981' : data.movement !== null && data.movement < 0 ? '#f43f5e' : '#3b82f6'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#fff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Data point count */}
      <div className="text-center text-white/30 text-xs">
        {chartData.length} data points over 30 days
      </div>
    </div>
  );
});

// Expandable prop movement panel
export const PropMovementPanel = memo(function PropMovementPanel({
  gameId,
  playerName,
  propType,
  currentLine
}: PropMovementChartProps) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        <TrendingUp className="w-3.5 h-3.5" />
        <span>Line Movement</span>
      </button>
      
      {expanded && (
        <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <PropMovementChart
            gameId={gameId}
            playerName={playerName}
            propType={propType}
            currentLine={currentLine}
          />
        </div>
      )}
    </div>
  );
});

export default PropMovementChart;
