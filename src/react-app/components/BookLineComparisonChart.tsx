/**
 * BookLineComparisonChart - Compare line movements across multiple sportsbooks
 * Shows how different books have moved their lines over time on the same chart
 */

import { useState, useEffect, useMemo } from "react";
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
import { Loader2, AlertCircle } from "lucide-react";

// Book colors that are visually distinct
const BOOK_COLORS: Record<string, string> = {
  draftkings: "#53d337",
  fanduel: "#1493ff",
  betmgm: "#ccaa00",
  caesars: "#c41230",
  pointsbet: "#ff5c00",
  espnbet: "#d00",
  bet365: "#027b5b",
  consensus: "#888888",
};

const BOOK_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  pointsbet: "PointsBet",
  espnbet: "ESPN BET",
  bet365: "Bet365",
  consensus: "Consensus",
};

interface BookHistoryResponse {
  game_id: string;
  market_key: string;
  books: {
    bookmaker_key: string;
    name: string;
    snapshots: {
      timestamp: string;
      line_value: number | null;
      price_american: number | null;
    }[];
    current_line: number | null;
    current_price: number | null;
    opening_line: number | null;
    movement: number | null;
  }[];
  timestamps: string[];
}

interface BookLineComparisonChartProps {
  gameId: string;
  market: "SPREAD" | "TOTAL" | "MONEYLINE";
  outcome?: "HOME" | "AWAY" | "OVER" | "UNDER";
  height?: number;
  selectedBooks?: string[];
  className?: string;
}

export function BookLineComparisonChart({
  gameId,
  market,
  outcome,
  height = 200,
  selectedBooks,
  className,
}: BookLineComparisonChartProps) {
  const [data, setData] = useState<BookHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBooks, setActiveBooks] = useState<Set<string>>(new Set());

  // Fetch book history data
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const defaultOutcome = market === "TOTAL" ? "OVER" : "HOME";
        const targetOutcome = outcome || defaultOutcome;
        
        const params = new URLSearchParams({
          market,
          outcome: targetOutcome,
          scope: "DEMO",
        });
        if (selectedBooks?.length) {
          params.set("books", selectedBooks.join(","));
        }
        
        const res = await fetch(`/api/odds/book-history/${gameId}?${params}`);
        
        if (!res.ok) {
          throw new Error("Failed to fetch book history");
        }
        
        const json = await res.json();
        setData(json);
        
        // Initialize active books (show top 4 by default)
        const initialBooks = json.books
          .slice(0, 4)
          .map((b: { bookmaker_key: string }) => b.bookmaker_key);
        setActiveBooks(new Set(initialBooks));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    if (gameId) {
      fetchHistory();
    }
  }, [gameId, market, outcome, selectedBooks?.join(",")]);

  // Toggle book visibility
  const toggleBook = (bookKey: string) => {
    setActiveBooks(prev => {
      const next = new Set(prev);
      if (next.has(bookKey)) {
        next.delete(bookKey);
      } else {
        next.add(bookKey);
      }
      return next;
    });
  };

  // Transform data for recharts
  const chartData = useMemo(() => {
    if (!data) return [] as Array<Record<string, number | string | null>>;
    
    const isMoneyline = market === "MONEYLINE";
    
    // Create a map of timestamp -> book values
    const timeMap = new Map<string, Record<string, number | null>>();
    
    for (const book of data.books) {
      for (const snap of book.snapshots) {
        const time = snap.timestamp;
        if (!timeMap.has(time)) {
          timeMap.set(time, {});
        }
        timeMap.get(time)![book.bookmaker_key] = isMoneyline 
          ? snap.price_american 
          : snap.line_value;
      }
    }
    
    // Convert to array and sort by time
    return Array.from(timeMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([timestamp, values], idx) => ({
        idx,
        timestamp,
        time: new Date(timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        date: new Date(timestamp).toLocaleDateString([], {
          month: "short",
          day: "numeric",
        }),
        ...values,
      } as Record<string, number | string | null>));
  }, [data, market]);

  // Calculate Y axis domain
  const yDomain = useMemo(() => {
    if (!chartData.length || !data) return [0, 100];
    
    const activeValues: number[] = [];
    for (const point of chartData) {
      for (const book of data.books) {
        if (activeBooks.has(book.bookmaker_key)) {
          const val = point[book.bookmaker_key] as number | null;
          if (val !== null && val !== undefined) {
            activeValues.push(val);
          }
        }
      }
    }
    
    if (activeValues.length === 0) return [0, 100];
    
    const min = Math.min(...activeValues);
    const max = Math.max(...activeValues);
    const padding = Math.max((max - min) * 0.15, 1);
    return [min - padding, max + padding];
  }, [chartData, data, activeBooks]);

  // Format value for display
  const formatValue = (val: number | null) => {
    if (val === null || val === undefined) return "-";
    if (market === "MONEYLINE") {
      return val > 0 ? `+${val}` : `${val}`;
    }
    return val > 0 ? `+${val}` : `${val}`;
  };

  if (loading) {
    return (
      <div 
        className={cn("flex items-center justify-center bg-muted/20 rounded-lg", className)}
        style={{ height }}
      >
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div 
        className={cn("flex flex-col items-center justify-center bg-muted/20 rounded-lg gap-2", className)}
        style={{ height }}
      >
        <AlertCircle className="w-5 h-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{error || "No data"}</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div 
        className={cn("flex items-center justify-center bg-muted/20 rounded-lg", className)}
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">No line history available</p>
      </div>
    );
  }

  // Get opening value for reference line (consensus or first active book)
  const openingValue = data.books.find(b => b.bookmaker_key === "consensus")?.opening_line
    ?? data.books.find(b => activeBooks.has(b.bookmaker_key))?.opening_line;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Book toggles */}
      <div className="flex flex-wrap gap-2">
        {data.books.map(book => {
          const isActive = activeBooks.has(book.bookmaker_key);
          const color = BOOK_COLORS[book.bookmaker_key] || "#666";
          const name = BOOK_NAMES[book.bookmaker_key] || book.bookmaker_key;
          
          return (
            <button
              key={book.bookmaker_key}
              onClick={() => toggleBook(book.bookmaker_key)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                isActive
                  ? "ring-2 ring-offset-1 ring-offset-background"
                  : "opacity-50 hover:opacity-75"
              )}
              style={{
                backgroundColor: isActive ? `${color}20` : undefined,
                borderColor: color,
                color: isActive ? color : undefined,
                // @ts-expect-error CSS custom property for ring color
                "--tw-ring-color": color,
              }}
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{name}</span>
              {book.movement !== null && book.movement !== 0 && (
                <span className={cn(
                  "font-mono",
                  book.movement > 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {book.movement > 0 ? "+" : ""}{book.movement}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
        >
          <XAxis 
            dataKey="idx"
            tickFormatter={(idx) => String(chartData[idx]?.time ?? "")}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis 
            domain={yDomain}
            tickFormatter={formatValue}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          
          {/* Opening line reference */}
          {openingValue !== null && openingValue !== undefined && (
            <ReferenceLine
              y={openingValue}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              label={{
                value: "Open",
                position: "right",
                fill: "hsl(var(--muted-foreground))",
                fontSize: 10,
              }}
            />
          )}

          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = chartData[label as number];
              if (!point) return null;
              
              return (
                <div className="bg-popover/95 backdrop-blur-sm border rounded-lg px-3 py-2 shadow-lg">
                  <p className="text-xs text-muted-foreground mb-2">
                    {point.date} {point.time}
                  </p>
                  <div className="space-y-1">
                    {payload
                      .filter(p => p.value !== null && p.value !== undefined)
                      .sort((a, b) => (b.value as number) - (a.value as number))
                      .map(p => (
                        <div 
                          key={String(p.dataKey)}
                          className="flex items-center justify-between gap-4 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: p.stroke as string }}
                            />
                            <span>{BOOK_NAMES[String(p.dataKey)] || String(p.dataKey)}</span>
                          </div>
                          <span className="font-mono font-medium">
                            {formatValue(p.value as number)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            }}
          />

          {/* Lines for each active book */}
          {data.books
            .filter(book => activeBooks.has(book.bookmaker_key))
            .map(book => (
              <Line
                key={book.bookmaker_key}
                type="monotone"
                dataKey={book.bookmaker_key}
                stroke={BOOK_COLORS[book.bookmaker_key] || "#666"}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: BOOK_COLORS[book.bookmaker_key] || "#666",
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                }}
                connectNulls
              />
            ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Current values summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {data.books
          .filter(book => activeBooks.has(book.bookmaker_key))
          .map(book => (
            <div 
              key={book.bookmaker_key}
              className="bg-muted/30 rounded-lg p-2 text-center"
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                {BOOK_NAMES[book.bookmaker_key] || book.bookmaker_key}
              </p>
              <p 
                className="text-sm font-mono font-semibold"
                style={{ color: BOOK_COLORS[book.bookmaker_key] }}
              >
                {formatValue(book.current_line ?? book.current_price)}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
