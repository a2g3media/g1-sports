/**
 * LineMovementChart - Mini sparkline chart showing odds movement over time
 * Uses Recharts for visualization
 */

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/react-app/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SnapshotPoint {
  timestamp: string;
  line: number | null;
  price: number | null;
}

interface SnapshotSeries {
  market_key: string;
  outcome_key: string;
  points: SnapshotPoint[];
}

interface SnapshotData {
  game_id: string;
  series: SnapshotSeries[];
  total_snapshots: number;
}

interface LineMovementChartProps {
  gameId: string;
  market: "SPREAD" | "TOTAL" | "MONEYLINE";
  outcome?: "HOME" | "AWAY" | "OVER" | "UNDER";
  height?: number;
  showLabels?: boolean;
  className?: string;
  scope?: "DEMO" | "PROD";
}

export function LineMovementChart({
  gameId,
  market,
  outcome,
  height = 80,
  showLabels = false,
  className,
  scope = "DEMO",
}: LineMovementChartProps) {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        const res = await fetch(
          `/api/odds/snapshots/${gameId}?market=${market}&scope=${scope}`
        );
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch snapshots:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshots();
  }, [gameId, market]);

  if (loading) {
    return (
      <div
        className={cn("animate-pulse bg-muted/30 rounded", className)}
        style={{ height }}
      />
    );
  }

  if (!data || data.series.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-xs text-muted-foreground bg-muted/20 rounded",
          className
        )}
        style={{ height }}
      >
        No history
      </div>
    );
  }

  // Find the right series based on outcome
  const defaultOutcome =
    market === "TOTAL" ? "OVER" : market === "MONEYLINE" ? "HOME" : "HOME";
  const targetOutcome = outcome || defaultOutcome;
  const series = data.series.find((s) => s.outcome_key === targetOutcome);

  if (!series || series.points.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-xs text-muted-foreground bg-muted/20 rounded",
          className
        )}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  // Format data for chart
  const isMoneyline = market === "MONEYLINE";
  const chartData = series.points.map((p, i) => ({
    idx: i,
    value: isMoneyline ? p.price : p.line,
    time: new Date(p.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    fullTime: new Date(p.timestamp).toLocaleString(),
  }));

  // Calculate trend
  const firstValue = chartData[0]?.value ?? 0;
  const lastValue = chartData[chartData.length - 1]?.value ?? 0;
  const trend =
    lastValue > firstValue ? "up" : lastValue < firstValue ? "down" : "flat";
  const change = lastValue - firstValue;

  // Determine color based on trend
  const lineColor =
    trend === "up"
      ? "hsl(142, 76%, 36%)"
      : trend === "down"
      ? "hsl(0, 84%, 60%)"
      : "hsl(var(--muted-foreground))";

  // Calculate domain for Y axis
  const values = chartData.map((d) => d.value).filter((v) => v !== null) as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.2 || 1;
  const yDomain = [min - padding, max + padding];

  // Format value for display
  const formatValue = (val: number) => {
    if (isMoneyline) {
      return val > 0 ? `+${val}` : `${val}`;
    }
    return val > 0 ? `+${val}` : `${val}`;
  };

  return (
    <div className={cn("relative", className)}>
      {/* Trend indicator */}
      {showLabels && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1">
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded",
              trend === "up" && "text-emerald-500 bg-emerald-500/10",
              trend === "down" && "text-red-500 bg-red-500/10",
              trend === "flat" && "text-muted-foreground bg-muted/50"
            )}
          >
            {trend === "up" && <TrendingUp className="w-3 h-3" />}
            {trend === "down" && <TrendingDown className="w-3 h-3" />}
            {trend === "flat" && <Minus className="w-3 h-3" />}
            <span>
              {change > 0 ? "+" : ""}
              {isMoneyline
                ? Math.round(change)
                : change % 1 === 0
                ? change
                : change.toFixed(1)}
            </span>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
        >
          <defs>
            <linearGradient id={`gradient-${gameId}-${market}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis dataKey="idx" hide />
          <YAxis domain={yDomain} hide />

          {/* Reference line at opening value */}
          <ReferenceLine
            y={firstValue}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeOpacity={0.3}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const data = payload[0].payload;
              return (
                <div className="bg-popover/95 backdrop-blur-sm border rounded-lg px-3 py-2 shadow-lg">
                  <p className="text-xs text-muted-foreground">{data.fullTime}</p>
                  <p className="text-sm font-semibold">
                    {formatValue(data.value)}
                  </p>
                </div>
              );
            }}
          />

          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              fill: lineColor,
              stroke: "hsl(var(--background))",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Opening → Current labels */}
      {showLabels && (
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-1">
          <span>Open: {formatValue(firstValue)}</span>
          <span>Now: {formatValue(lastValue)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for table cells
 */
export function LineMovementMini({
  gameId,
  market,
  outcome,
  scope = "DEMO",
}: {
  gameId: string;
  market: "SPREAD" | "TOTAL" | "MONEYLINE";
  outcome?: "HOME" | "AWAY" | "OVER" | "UNDER";
  scope?: "DEMO" | "PROD";
}) {
  return (
    <LineMovementChart
      gameId={gameId}
      market={market}
      outcome={outcome}
      height={40}
      showLabels={false}
      className="w-24"
      scope={scope}
    />
  );
}
