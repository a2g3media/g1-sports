import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";
import {
  ArrowLeft,
  RefreshCw,
  Star,
  Clock,
  BarChart3,
  Check,
  TrendingUp,
  GitCompare,
} from "lucide-react";
import { LineMovementChart } from "@/react-app/components/LineMovementChart";
import { BookLineComparisonChart } from "@/react-app/components/BookLineComparisonChart";

// Bookmaker metadata
const BOOK_META: Record<string, { name: string; logo: string; color: string }> = {
  draftkings: { name: "DraftKings", logo: "DK", color: "#53d337" },
  fanduel: { name: "FanDuel", logo: "FD", color: "#1493ff" },
  betmgm: { name: "BetMGM", logo: "MGM", color: "#ccaa00" },
  caesars: { name: "Caesars", logo: "CZR", color: "#c41230" },
  pointsbet: { name: "PointsBet", logo: "PB", color: "#ff5c00" },
  espnbet: { name: "ESPN BET", logo: "ESPN", color: "#d00" },
  bet365: { name: "bet365", logo: "365", color: "#027b5b" },
};

interface OddsQuote {
  bookmaker_key: string;
  market_key: string;
  outcome_key: string;
  line_value: number | null;
  price_american: number | null;
  price_decimal: number | null;
}

interface GameInfo {
  game_id: string;
  sport: string;
  status: string;
  home_team: string;
  away_team: string;
  start_time: string;
}

interface OddsData {
  game_id: string;
  sport: string;
  quotes: OddsQuote[];
  game?: GameInfo;
  fromCache?: boolean;
  source?: "sportsradar" | "fallback_demo";
  fallback_reason?: string | null;
}

export default function OddsExplorer() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<OddsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<"SPREAD" | "TOTAL" | "MONEYLINE">("SPREAD");
  const [refreshing, setRefreshing] = useState(false);

  const fetchOdds = async (refresh = false) => {
    if (!gameId) return;
    
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      
      const params = new URLSearchParams({
        scope: "PROD",
        markets: "SPREAD,TOTAL,MONEYLINE",
        books: "sportsradar,consensus",
      });
      if (refresh) params.set("refresh", "true");
      
      const res = await fetch(`/api/odds/games/${gameId}?${params}`);
      const json = await res.json();
      
      if (!res.ok) {
        setError(json.error || "Failed to fetch odds");
        return;
      }
      
      setData(json);
      setError(null);
    } catch {
      setError("Failed to fetch odds data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOdds();
  }, [gameId]);

  // Group quotes by book and market
  const groupedByBook = (market: string) => {
    if (!data?.quotes) return {};
    
    const filtered = data.quotes.filter(q => q.market_key === market);
    const grouped: Record<string, OddsQuote[]> = {};
    
    for (const quote of filtered) {
      if (!grouped[quote.bookmaker_key]) {
        grouped[quote.bookmaker_key] = [];
      }
      grouped[quote.bookmaker_key].push(quote);
    }
    
    return grouped;
  };

  // Find best line for spread (most negative for favorite, least negative for underdog)
  const findBestSpread = (quotes: OddsQuote[], side: "HOME" | "AWAY") => {
    const sideQuotes = quotes.filter(q => q.outcome_key === side);
    if (sideQuotes.length === 0) return null;
    
    // For spreads, best is the most favorable line (higher for underdog, lower for favorite)
    // AND best price
    let best = sideQuotes[0];
    for (const q of sideQuotes) {
      // Better line value OR same line with better price
      if (q.line_value !== null && best.line_value !== null) {
        if (q.line_value > best.line_value) {
          best = q;
        } else if (q.line_value === best.line_value && 
                   q.price_american !== null && best.price_american !== null &&
                   q.price_american > best.price_american) {
          best = q;
        }
      }
    }
    return best.bookmaker_key;
  };

  // Find best total
  const findBestTotal = (quotes: OddsQuote[], side: "OVER" | "UNDER") => {
    const sideQuotes = quotes.filter(q => q.outcome_key === side);
    if (sideQuotes.length === 0) return null;
    
    let best = sideQuotes[0];
    for (const q of sideQuotes) {
      if (q.price_american !== null && best.price_american !== null &&
          q.price_american > best.price_american) {
        best = q;
      }
    }
    return best.bookmaker_key;
  };

  // Find best moneyline
  const findBestMoneyline = (quotes: OddsQuote[], side: "HOME" | "AWAY") => {
    const sideQuotes = quotes.filter(q => q.outcome_key === side);
    if (sideQuotes.length === 0) return null;
    
    let best = sideQuotes[0];
    for (const q of sideQuotes) {
      if (q.price_american !== null && best.price_american !== null &&
          q.price_american > best.price_american) {
        best = q;
      }
    }
    return best.bookmaker_key;
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return "-";
    return price > 0 ? `+${price}` : `${price}`;
  };

  const formatLine = (line: number | null, isSpread = false) => {
    if (line === null) return "-";
    if (isSpread) {
      return line > 0 ? `+${line}` : `${line}`;
    }
    return `${line}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading odds...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
            <p className="text-destructive">{error || "Failed to load odds"}</p>
            <Button onClick={() => fetchOdds()} className="mt-4">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const spreadQuotes = data.quotes.filter(q => q.market_key === "SPREAD");
  const totalQuotes = data.quotes.filter(q => q.market_key === "TOTAL");
  const moneylineQuotes = data.quotes.filter(q => q.market_key === "MONEYLINE");

  const bestSpreadHome = findBestSpread(spreadQuotes, "HOME");
  const bestSpreadAway = findBestSpread(spreadQuotes, "AWAY");
  const bestTotalOver = findBestTotal(totalQuotes, "OVER");
  const bestTotalUnder = findBestTotal(totalQuotes, "UNDER");
  const bestMLHome = findBestMoneyline(moneylineQuotes, "HOME");
  const bestMLAway = findBestMoneyline(moneylineQuotes, "AWAY");

  const books = Object.keys(groupedByBook(selectedMarket)).sort((a, b) => {
    const orderA = ["draftkings", "fanduel", "betmgm", "caesars", "pointsbet", "espnbet"].indexOf(a);
    const orderB = ["draftkings", "fanduel", "betmgm", "caesars", "pointsbet", "espnbet"].indexOf(b);
    return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
  });

  const homeTeam = data.game?.home_team || gameId?.split("-").pop()?.toUpperCase() || "HOME";
  const awayTeam = data.game?.away_team || "AWAY";
  const hasNoOdds = !data.quotes || data.quotes.length === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">Odds Explorer</h1>
                <p className="text-sm text-muted-foreground">
                  {awayTeam} @ {homeTeam}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOdds(true)}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "text-xs px-2 py-1 rounded-full border",
            data.source === "sportsradar"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300"
          )}>
            Source: {data.source === "sportsradar" ? "SportsRadar" : "Fallback"}
          </span>
          {data.fallback_reason && (
            <span className="text-xs text-amber-300">
              {data.fallback_reason}
            </span>
          )}
        </div>

        {hasNoOdds && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
            No odds available for this game right now. Try refresh, another game, or check SportsRadar coverage.
          </div>
        )}

        {/* Market Tabs */}
        <div className="flex gap-2">
          {(["SPREAD", "TOTAL", "MONEYLINE"] as const).map((market) => (
            <button
              key={market}
              onClick={() => setSelectedMarket(market)}
              className={cn(
                "px-4 py-2 rounded-lg font-medium text-sm transition-all",
                selectedMarket === market
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {market === "SPREAD" && "Spread"}
              {market === "TOTAL" && "Total"}
              {market === "MONEYLINE" && "Moneyline"}
            </button>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          {/* Table Header */}
          <div className="grid grid-cols-[120px_1fr_1fr] sm:grid-cols-[140px_1fr_1fr] min-w-[400px] border-b bg-muted/30">
            <div className="p-4 font-medium text-sm text-muted-foreground">
              Sportsbook
            </div>
            <div className="p-4 font-medium text-sm text-center border-l">
              {selectedMarket === "TOTAL" ? "Over" : awayTeam}
            </div>
            <div className="p-4 font-medium text-sm text-center border-l">
              {selectedMarket === "TOTAL" ? "Under" : homeTeam}
            </div>
          </div>

          {/* Book Rows */}
          {books.map((bookKey) => {
            const meta = BOOK_META[bookKey] || { name: bookKey, logo: bookKey.slice(0, 2).toUpperCase(), color: "#666" };
            const bookQuotes = groupedByBook(selectedMarket)[bookKey] || [];
            
            const leftQuote = bookQuotes.find(q => 
              selectedMarket === "TOTAL" ? q.outcome_key === "OVER" : q.outcome_key === "AWAY"
            );
            const rightQuote = bookQuotes.find(q => 
              selectedMarket === "TOTAL" ? q.outcome_key === "UNDER" : q.outcome_key === "HOME"
            );

            const isBestLeft = selectedMarket === "SPREAD" ? bookKey === bestSpreadAway :
                              selectedMarket === "TOTAL" ? bookKey === bestTotalOver :
                              bookKey === bestMLAway;
            const isBestRight = selectedMarket === "SPREAD" ? bookKey === bestSpreadHome :
                               selectedMarket === "TOTAL" ? bookKey === bestTotalUnder :
                               bookKey === bestMLHome;

            return (
              <div 
                key={bookKey}
                className="grid grid-cols-[120px_1fr_1fr] sm:grid-cols-[140px_1fr_1fr] min-w-[400px] border-b last:border-b-0 hover:bg-muted/20 transition-colors"
              >
                {/* Book Name */}
                <div className="p-4 flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.logo}
                  </div>
                  <span className="font-medium text-sm">{meta.name}</span>
                </div>

                {/* Left Side (Away/Over) */}
                <div className={cn(
                  "p-4 flex items-center justify-center gap-3 border-l transition-colors",
                  isBestLeft && "bg-emerald-500/10"
                )}>
                  {leftQuote ? (
                    <div className="flex items-center gap-2">
                      {selectedMarket !== "MONEYLINE" && (
                        <span className="font-mono font-semibold text-lg">
                          {formatLine(leftQuote.line_value, selectedMarket === "SPREAD")}
                        </span>
                      )}
                      <span className={cn(
                        "font-mono text-sm px-2 py-1 rounded",
                        leftQuote.price_american && leftQuote.price_american > 0 
                          ? "text-emerald-500 bg-emerald-500/10" 
                          : "text-muted-foreground bg-muted/50"
                      )}>
                        {formatPrice(leftQuote.price_american)}
                      </span>
                      {isBestLeft && (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>

                {/* Right Side (Home/Under) */}
                <div className={cn(
                  "p-4 flex items-center justify-center gap-3 border-l transition-colors",
                  isBestRight && "bg-emerald-500/10"
                )}>
                  {rightQuote ? (
                    <div className="flex items-center gap-2">
                      {selectedMarket !== "MONEYLINE" && (
                        <span className="font-mono font-semibold text-lg">
                          {formatLine(rightQuote.line_value, selectedMarket === "SPREAD")}
                        </span>
                      )}
                      <span className={cn(
                        "font-mono text-sm px-2 py-1 rounded",
                        rightQuote.price_american && rightQuote.price_american > 0 
                          ? "text-emerald-500 bg-emerald-500/10" 
                          : "text-muted-foreground bg-muted/50"
                      )}>
                        {formatPrice(rightQuote.price_american)}
                      </span>
                      {isBestRight && (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {/* Per-Book Line Comparison */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitCompare className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Book-by-Book Comparison</h3>
            <span className="text-xs text-muted-foreground ml-auto">Last 48 hours</span>
          </div>
          
          <div className="space-y-6">
            {/* Spread Comparison */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Spread — {homeTeam}
              </p>
              <BookLineComparisonChart
                gameId={gameId || ""}
                market="SPREAD"
                outcome="HOME"
                height={180}
              />
            </div>

            {/* Total Comparison */}
            <div className="space-y-2 pt-4 border-t border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Total — Over
              </p>
              <BookLineComparisonChart
                gameId={gameId || ""}
                market="TOTAL"
                outcome="OVER"
                height={180}
              />
            </div>

            {/* Moneyline Comparison */}
            <div className="space-y-2 pt-4 border-t border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Moneyline — {homeTeam}
              </p>
              <BookLineComparisonChart
                gameId={gameId || ""}
                market="MONEYLINE"
                outcome="HOME"
                height={180}
              />
            </div>
          </div>
        </div>

        {/* Consensus Line Movement (Compact) */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold text-muted-foreground">Consensus Movement</h3>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {/* Spread Movement */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Spread
              </p>
              <div className="bg-muted/30 rounded-lg p-3">
                <LineMovementChart
                  gameId={gameId || ""}
                  market="SPREAD"
                  outcome="HOME"
                  height={80}
                  showLabels
                />
              </div>
            </div>

            {/* Total Movement */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Total (O/U)
              </p>
              <div className="bg-muted/30 rounded-lg p-3">
                <LineMovementChart
                  gameId={gameId || ""}
                  market="TOTAL"
                  outcome="OVER"
                  height={80}
                  showLabels
                />
              </div>
            </div>

            {/* Moneyline Movement */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Moneyline
              </p>
              <div className="bg-muted/30 rounded-lg p-3">
                <LineMovementChart
                  gameId={gameId || ""}
                  market="MONEYLINE"
                  outcome="HOME"
                  height={80}
                  showLabels
                />
              </div>
            </div>
          </div>
        </div>

        {/* Best Lines Summary */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold">Best Available Lines</h3>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4">
            {/* Spread */}
            <div className="bg-background/50 rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Spread</p>
              <div className="space-y-2">
                {bestSpreadAway && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{awayTeam}</span>
                    <span className="text-sm font-medium text-emerald-500">
                      {BOOK_META[bestSpreadAway]?.name || bestSpreadAway}
                    </span>
                  </div>
                )}
                {bestSpreadHome && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{homeTeam}</span>
                    <span className="text-sm font-medium text-emerald-500">
                      {BOOK_META[bestSpreadHome]?.name || bestSpreadHome}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Total */}
            <div className="bg-background/50 rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Total</p>
              <div className="space-y-2">
                {bestTotalOver && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Over</span>
                    <span className="text-sm font-medium text-emerald-500">
                      {BOOK_META[bestTotalOver]?.name || bestTotalOver}
                    </span>
                  </div>
                )}
                {bestTotalUnder && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Under</span>
                    <span className="text-sm font-medium text-emerald-500">
                      {BOOK_META[bestTotalUnder]?.name || bestTotalUnder}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Moneyline */}
            <div className="bg-background/50 rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Moneyline</p>
              <div className="space-y-2">
                {bestMLAway && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{awayTeam}</span>
                    <span className="text-sm font-medium text-emerald-500">
                      {BOOK_META[bestMLAway]?.name || bestMLAway}
                    </span>
                  </div>
                )}
                {bestMLHome && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{homeTeam}</span>
                    <span className="text-sm font-medium text-emerald-500">
                      {BOOK_META[bestMLHome]?.name || bestMLHome}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{books.length} sportsbooks • {data.quotes.length} quotes</span>
          </div>
        </div>
      </main>
    </div>
  );
}
