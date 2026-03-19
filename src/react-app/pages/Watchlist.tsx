import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Bell, BellOff, Eye, EyeOff, Trash2, TrendingUp, TrendingDown,
  AlertTriangle, Clock, ChevronRight, RefreshCw, Plus, BarChart3, 
  Minus, Settings2, ChevronDown, ChevronUp, LineChart, Star, Radio
} from "lucide-react";
import { WatchlistManagement } from "@/react-app/components/WatchlistManagement";
import { WatchboardTicker, type TickerPlay } from "@/react-app/components/WatchboardTicker";
import { cn } from "@/react-app/lib/utils";
import { Button } from "@/react-app/components/ui/button";

import { Switch } from "@/react-app/components/ui/switch";
import { LineMovementChart } from "@/react-app/components/LineMovementChart";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/react-app/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/react-app/components/ui/dialog";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import type { WatchlistEntryWithOdds, LineAlert } from "@/shared/types";

// =====================================================
// CINEMATIC BACKGROUND
// =====================================================

function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      <div 
        className="absolute top-1/4 -left-32 w-96 h-96 rounded-full blur-[120px] animate-pulse"
        style={{ 
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
          animationDuration: '4s'
        }}
      />
      <div 
        className="absolute bottom-1/3 -right-32 w-96 h-96 rounded-full blur-[120px] animate-pulse"
        style={{ 
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%)',
          animationDuration: '5s',
          animationDelay: '1s'
        }}
      />
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />
    </div>
  );
}

// =====================================================
// API HOOKS
// =====================================================

function useWatchlist(scope: string, isDemoMode: boolean) {
  const [entries, setEntries] = useState<WatchlistEntryWithOdds[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = (): HeadersInit => {
    const headers: HeadersInit = {};
    if (isDemoMode) headers["X-Demo-Mode"] = "true";
    return headers;
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch(`/api/watchlist?scope=${scope}`, { headers: getHeaders() });
      if (res.status === 401) {
        setError("Please sign in to view your watchlist");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setEntries(data.entries || []);
      setAlertCount(data.alert_count || 0);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch watchlist:", err);
      setError("Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    const interval = setInterval(fetchWatchlist, 60000);
    return () => clearInterval(interval);
  }, [scope, isDemoMode]);

  const removeFromWatchlist = async (id: number) => {
    try {
      await fetch(`/api/watchlist/${id}?scope=${scope}`, { method: "DELETE", headers: getHeaders() });
      setEntries(entries.filter(e => e.id !== id));
    } catch (err) {
      console.error("Failed to remove from watchlist:", err);
    }
  };

  const updateSettings = async (id: number, settings: Partial<WatchlistEntryWithOdds>) => {
    try {
      await fetch(`/api/watchlist/${id}?scope=${scope}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { "X-Demo-Mode": "true" } : {}) },
        body: JSON.stringify(settings),
      });
      setEntries(entries.map(e => e.id === id ? { ...e, ...settings } : e));
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const markAllRead = async () => {
    try {
      await fetch(`/api/watchlist/mark-read?scope=${scope}`, { method: "POST", headers: getHeaders() });
      setEntries(entries.map(e => ({ ...e, has_unread_alert: false })));
      setAlertCount(0);
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  return { 
    entries, alertCount, loading, error, 
    refresh: fetchWatchlist, removeFromWatchlist, updateSettings, markAllRead,
  };
}

// =====================================================
// GLASS CARD COMPONENT
// =====================================================

function GlassCard({ 
  children, 
  className,
  glow,
}: { 
  children: React.ReactNode; 
  className?: string;
  glow?: 'blue' | 'amber' | 'red' | 'purple';
}) {
  const glowColors = {
    blue: 'from-blue-500/20 via-transparent to-transparent',
    amber: 'from-amber-500/20 via-transparent to-transparent',
    red: 'from-red-500/20 via-transparent to-transparent',
    purple: 'from-purple-500/20 via-transparent to-transparent',
  };

  return (
    <div className={cn("relative", className)}>
      {glow && (
        <div className={cn(
          "absolute -inset-0.5 rounded-2xl blur-xl opacity-50 bg-gradient-to-br",
          glowColors[glow]
        )} />
      )}
      <div className="relative bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        <div className="relative">
          {children}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// COMPONENTS
// =====================================================

function MovementBadge({ 
  value, 
  type 
}: { 
  value: number | null;
  type: "spread" | "total" | "ml";
}) {
  if (value === null || value === 0) return null;
  
  const isUp = value > 0;
  const displayValue = type === "ml" 
    ? (isUp ? `+${value}` : `${value}`)
    : (isUp ? `+${value.toFixed(1)}` : `${value.toFixed(1)}`);
  
  const significance = Math.abs(value) >= (type === "ml" ? 20 : 1.5) ? "major" : 
                       Math.abs(value) >= (type === "ml" ? 10 : 0.5) ? "notable" : "minor";
  
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium",
      significance === "major" && "bg-red-500/20 text-red-400 border border-red-500/30",
      significance === "notable" && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
      significance === "minor" && "bg-slate-500/20 text-slate-400 border border-slate-500/30",
    )}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {displayValue}
    </span>
  );
}

function LineDisplay({ 
  label, 
  current, 
  initial, 
  movement, 
  type 
}: { 
  label: string;
  current: number | null;
  initial: number | null;
  movement: number | null;
  type: "spread" | "total" | "ml";
}) {
  const formatValue = (val: number | null) => {
    if (val === null) return "—";
    if (type === "spread") return val > 0 ? `+${val}` : `${val}`;
    if (type === "total") return `${val}`;
    if (type === "ml") return val > 0 ? `+${val}` : `${val}`;
    return `${val}`;
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="flex items-center gap-3">
        {initial !== null && movement !== null && movement !== 0 && (
          <span className="text-xs text-slate-500 line-through">{formatValue(initial)}</span>
        )}
        <span className="text-sm font-semibold text-white font-mono">{formatValue(current)}</span>
        <MovementBadge value={movement} type={type} />
      </div>
    </div>
  );
}

function AlertCard({ alert, gameInfo }: { alert: LineAlert; gameInfo: string }) {
  const icons = {
    SPREAD: <BarChart3 className="w-4 h-4" />,
    TOTAL: <TrendingUp className="w-4 h-4" />,
    MONEYLINE: <Minus className="w-4 h-4" />,
  };

  const glowColor = alert.significance === "MAJOR" ? "red" : alert.significance === "NOTABLE" ? "amber" : undefined;

  const formatChange = () => {
    const oldStr = alert.old_value > 0 ? `+${alert.old_value}` : `${alert.old_value}`;
    const newStr = alert.new_value > 0 ? `+${alert.new_value}` : `${alert.new_value}`;
    return `${oldStr} → ${newStr}`;
  };

  return (
    <GlassCard glow={glowColor}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-xl",
            alert.significance === "MAJOR" && "bg-red-500/20 text-red-400",
            alert.significance === "NOTABLE" && "bg-amber-500/20 text-amber-400",
            alert.significance === "MINOR" && "bg-slate-500/20 text-slate-400",
          )}>
            {icons[alert.market]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm text-white">{alert.market}</span>
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full",
                alert.significance === "MAJOR" && "bg-red-500/20 text-red-400",
                alert.significance === "NOTABLE" && "bg-amber-500/20 text-amber-400",
                alert.significance === "MINOR" && "bg-slate-500/20 text-slate-400",
              )}>
                {alert.direction === "UP" ? "↑" : "↓"} {alert.significance.toLowerCase()}
              </span>
            </div>
            <p className="text-sm text-slate-400 truncate">{gameInfo}</p>
            <p className="text-xs font-mono mt-1 text-slate-500">
              {formatChange()} ({alert.change > 0 ? "+" : ""}{alert.change.toFixed(1)})
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function WatchedGameCard({ 
  entry, 
  onRemove,
  onUpdateSettings,
  scope,
}: { 
  entry: WatchlistEntryWithOdds;
  onRemove: () => void;
  onUpdateSettings: (settings: Partial<WatchlistEntryWithOdds>) => void;
  scope: "DEMO" | "PROD";
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const navigate = useNavigate();
  
  const gameTime = new Date(entry.game_start_time);
  const isUpcoming = gameTime > new Date();
  const timeStr = gameTime.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const hasAlerts = entry.alerts && entry.alerts.length > 0;
  const majorAlerts = entry.alerts?.filter(a => a.significance === "MAJOR") || [];
  const glow = majorAlerts.length > 0 ? "red" : hasAlerts ? "amber" : undefined;
  
  return (
    <GlassCard glow={glow}>
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium uppercase">
                {entry.sport_key}
              </span>
              {hasAlerts && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                  <AlertTriangle className="w-3 h-3" />
                  {entry.alerts.length} alert{entry.alerts.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-white truncate">
              {entry.away_team} @ {entry.home_team}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
              <Clock className="w-3 h-3" />
              <span>{timeStr}</span>
              {!isUpcoming && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 ml-1">LIVE</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10">
                  <Settings2 className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-white">Alert Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium text-slate-300">Markets to Watch</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Spread</span>
                        <Switch 
                          checked={entry.watch_spread} 
                          onCheckedChange={(v) => onUpdateSettings({ watch_spread: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Total (O/U)</span>
                        <Switch 
                          checked={entry.watch_total} 
                          onCheckedChange={(v) => onUpdateSettings({ watch_total: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Moneyline</span>
                        <Switch 
                          checked={entry.watch_moneyline} 
                          onCheckedChange={(v) => onUpdateSettings({ watch_moneyline: v })}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-white/10">
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={() => { onRemove(); setShowSettings(false); }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove from Watchlist
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
              onClick={onRemove}
            >
              <EyeOff className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Lines */}
      <div className="p-4 space-y-1">
        {entry.watch_spread && (
          <LineDisplay 
            label="Spread" 
            current={entry.current_spread} 
            initial={entry.initial_spread} 
            movement={entry.spread_movement}
            type="spread"
          />
        )}
        {entry.watch_total && (
          <LineDisplay 
            label="Total" 
            current={entry.current_total} 
            initial={entry.initial_total} 
            movement={entry.total_movement}
            type="total"
          />
        )}
        {entry.watch_moneyline && (
          <LineDisplay 
            label="Home ML" 
            current={entry.current_home_ml} 
            initial={entry.initial_home_ml} 
            movement={entry.ml_movement}
            type="ml"
          />
        )}
      </div>
      
      {/* Alerts */}
      {hasAlerts && (
        <div className="px-4 pb-4 space-y-2">
          {entry.alerts.slice(0, 2).map((alert, i) => (
            <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "p-1.5 rounded-lg",
                  alert.significance === "MAJOR" && "bg-red-500/20 text-red-400",
                  alert.significance === "NOTABLE" && "bg-amber-500/20 text-amber-400",
                  alert.significance === "MINOR" && "bg-slate-500/20 text-slate-400",
                )}>
                  <AlertTriangle className="w-3 h-3" />
                </span>
                <span className="text-xs font-medium text-white">{alert.market}</span>
                <span className="text-xs text-slate-400">
                  {alert.old_value > 0 ? "+" : ""}{alert.old_value} → {alert.new_value > 0 ? "+" : ""}{alert.new_value}
                </span>
              </div>
            </div>
          ))}
          {entry.alerts.length > 2 && (
            <p className="text-xs text-center text-slate-500">
              +{entry.alerts.length - 2} more alert{entry.alerts.length - 2 > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
      
      {/* Line History Charts Toggle */}
      <div className="px-4 pb-2">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <LineChart className="w-4 h-4 text-blue-400" />
            Line History
          </span>
          {showCharts ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>
      </div>
      
      {/* Line History Charts */}
      {showCharts && (
        <div className="px-4 pb-4 space-y-4">
          {entry.watch_spread && (
            <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Spread Movement</span>
                <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded bg-white/5">
                  {entry.initial_spread != null && entry.current_spread != null ? (
                    <>
                      {entry.initial_spread > 0 ? "+" : ""}{entry.initial_spread} → {entry.current_spread > 0 ? "+" : ""}{entry.current_spread}
                    </>
                  ) : "—"}
                </span>
              </div>
              <LineMovementChart 
                gameId={entry.game_id} 
                market="SPREAD" 
                outcome="HOME"
                height={100}
                showLabels={true}
                className="w-full"
                scope={scope}
              />
            </div>
          )}
          
          {entry.watch_total && (
            <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Total (O/U) Movement</span>
                <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded bg-white/5">
                  {entry.initial_total != null && entry.current_total != null ? (
                    <>{entry.initial_total} → {entry.current_total}</>
                  ) : "—"}
                </span>
              </div>
              <LineMovementChart 
                gameId={entry.game_id} 
                market="TOTAL" 
                outcome="OVER"
                height={100}
                showLabels={true}
                className="w-full"
                scope={scope}
              />
            </div>
          )}
          
          {entry.watch_moneyline && (
            <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Moneyline Movement</span>
                <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded bg-white/5">
                  {entry.initial_home_ml != null && entry.current_home_ml != null ? (
                    <>
                      {entry.initial_home_ml > 0 ? "+" : ""}{entry.initial_home_ml} → {entry.current_home_ml > 0 ? "+" : ""}{entry.current_home_ml}
                    </>
                  ) : "—"}
                </span>
              </div>
              <LineMovementChart 
                gameId={entry.game_id} 
                market="MONEYLINE" 
                outcome="HOME"
                height={100}
                showLabels={true}
                className="w-full"
                scope={scope}
              />
            </div>
          )}
        </div>
      )}
      
      {/* Quick action */}
      <div className="px-4 pb-4">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full gap-2 bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]"
          onClick={() => navigate(`/tracker?game=${entry.game_id}`)}
        >
          Make a Pick
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </GlassCard>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 w-20 h-20 bg-blue-500/20 rounded-full blur-xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
          <Eye className="w-8 h-8 text-slate-400" />
        </div>
      </div>
      <h3 className="font-semibold text-lg text-white mb-2">No games on your watchlist</h3>
      <p className="text-slate-400 text-sm mb-6 max-w-sm">
        Add games to your watchlist to track line movements and get alerts when odds shift.
      </p>
      <Link to="/picks">
        <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          Browse Games
        </Button>
      </Link>
    </div>
  );
}

// =====================================================
// STAT CARD
// =====================================================

function StatCard({ value, label, color }: { value: number; label: string; color?: 'blue' | 'amber' | 'emerald' }) {
  const colors = {
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
  };

  return (
    <GlassCard>
      <div className="p-4 text-center">
        <div className={cn("text-3xl font-bold", color ? colors[color] : "text-white")}>
          {value}
        </div>
        <div className="text-xs text-slate-400 mt-1">{label}</div>
      </div>
    </GlassCard>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function Watchlist() {
  const navigate = useNavigate();
  const { isDemoMode } = useDemoAuth();
  const scope = isDemoMode ? "DEMO" : "PROD";
  const [activeTab, setActiveTab] = useState("following");
  const [tickerPlays, setTickerPlays] = useState<TickerPlay[]>([]);
  const [showTicker, setShowTicker] = useState(true);
  
  const { 
    entries, alertCount, loading, error, 
    refresh, removeFromWatchlist, updateSettings, markAllRead,
  } = useWatchlist(scope, isDemoMode);
  
  // Fetch live plays for watched games
  const fetchLivePlays = useCallback(async () => {
    // Get live games from watchlist
    const liveGames = entries.filter(e => new Date(e.game_start_time) <= new Date());
    if (liveGames.length === 0) return;
    
    try {
      const allPlays: TickerPlay[] = [];
      
      // Fetch play-by-play for each live game (limit to 3 games)
      for (const game of liveGames.slice(0, 3)) {
        try {
          const res = await fetch(`/api/games/${game.game_id}/playbyplay`);
          if (!res.ok) continue;
          const data = await res.json();
          
          // Transform plays to ticker format
          const plays = (data.plays || []).slice(0, 5).map((play: {
            id?: string;
            description?: string;
            clock?: string;
            period?: string;
            team?: string;
            points?: number;
            isScoring?: boolean;
            isMajor?: boolean;
            playerName?: string;
          }, idx: number) => ({
            id: play.id || `${game.game_id}-${idx}`,
            gameId: game.game_id,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            description: play.description || '',
            clock: play.clock,
            period: play.period,
            team: play.team,
            points: play.points,
            isScoring: play.isScoring,
            isMajor: play.isMajor,
            playerName: play.playerName,
            timestamp: Date.now() - idx * 1000,
          }));
          
          allPlays.push(...plays);
        } catch {
          // Skip failed game fetches
        }
      }
      
      // Sort by timestamp and limit
      allPlays.sort((a, b) => b.timestamp - a.timestamp);
      setTickerPlays(allPlays.slice(0, 15));
    } catch (err) {
      console.error("Failed to fetch live plays:", err);
    }
  }, [entries]);
  
  // Poll for live plays every 20 seconds
  useEffect(() => {
    if (entries.length === 0) return;
    
    fetchLivePlays();
    const interval = setInterval(fetchLivePlays, 20000);
    return () => clearInterval(interval);
  }, [entries, fetchLivePlays]);
  
  const filteredEntries = entries.filter(entry => {
    if (activeTab === "all") return true;
    if (activeTab === "alerts") return entry.alerts && entry.alerts.length > 0;
    if (activeTab === "upcoming") return new Date(entry.game_start_time) > new Date();
    return true;
  });

  const allAlerts = entries.flatMap(entry => 
    (entry.alerts || []).map(alert => ({
      alert,
      gameInfo: `${entry.away_team} @ ${entry.home_team}`,
      gameId: entry.game_id,
    }))
  );
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <CinematicBackground />
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <CinematicBackground />
        <div className="text-center relative z-10">
          <p className="text-red-400 mb-4">{error}</p>
          <Button onClick={() => navigate("/login")} className="bg-blue-600 hover:bg-blue-700">
            Sign In
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen relative">
      <CinematicBackground />
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="shrink-0 text-slate-400 hover:text-white hover:bg-white/10"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="font-bold text-lg flex items-center gap-2 text-white">
                  <Eye className="w-5 h-5 text-blue-400" />
                  Watchlist
                  {alertCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                      {alertCount}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-500">Track line movements</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={refresh}
                className="shrink-0 text-slate-400 hover:text-white hover:bg-white/10"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              {alertCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={markAllRead}
                  className="gap-1 text-xs bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                >
                  <BellOff className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6 pb-24 relative z-10">
        {entries.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Live Ticker */}
            {tickerPlays.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Radio className="w-4 h-4 text-red-400" />
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    </div>
                    <span className="text-sm font-medium text-white">Live Feed</span>
                    <span className="text-xs text-slate-500">
                      {tickerPlays.length} plays
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTicker(!showTicker)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {showTicker ? (
                      <>
                        <ChevronUp className="w-3 h-3 mr-1" />
                        Hide
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3 mr-1" />
                        Show
                      </>
                    )}
                  </Button>
                </div>
                
                {showTicker && (
                  <WatchboardTicker 
                    plays={tickerPlays} 
                    compact={true}
                  />
                )}
              </div>
            )}
            
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard value={entries.length} label="Watching" color="blue" />
              <StatCard value={alertCount} label="Alerts" color="amber" />
              <StatCard 
                value={entries.filter(e => new Date(e.game_start_time) > new Date()).length} 
                label="Upcoming" 
                color="emerald"
              />
            </div>
            
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-xl p-1">
                <TabsList className="grid grid-cols-4 w-full bg-transparent">
                  <TabsTrigger 
                    value="following" 
                    className="text-xs gap-1 data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 rounded-lg"
                  >
                    <Star className="w-3 h-3" />
                    Following
                  </TabsTrigger>
                  <TabsTrigger 
                    value="all" 
                    className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 rounded-lg"
                  >
                    Lines
                  </TabsTrigger>
                  <TabsTrigger 
                    value="alerts" 
                    className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 rounded-lg"
                  >
                    Alerts
                  </TabsTrigger>
                  <TabsTrigger 
                    value="upcoming" 
                    className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400 rounded-lg"
                  >
                    Upcoming
                  </TabsTrigger>
                </TabsList>
              </div>
              
              {/* Following (Watchlist Management) */}
              <TabsContent value="following" className="mt-6">
                <WatchlistManagement />
              </TabsContent>
              
              {/* All Games */}
              <TabsContent value="all" className="mt-6 space-y-4">
                {filteredEntries.map(entry => (
                  <WatchedGameCard
                    key={entry.id}
                    entry={entry}
                    onRemove={() => removeFromWatchlist(entry.id!)}
                    onUpdateSettings={(settings) => updateSettings(entry.id!, settings)}
                    scope={scope}
                  />
                ))}
              </TabsContent>
              
              {/* Alerts Only */}
              <TabsContent value="alerts" className="mt-6 space-y-4">
                {allAlerts.length === 0 ? (
                  <div className="text-center py-12">
                    <Bell className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400">No line movement alerts yet</p>
                    <p className="text-xs mt-1 text-slate-500">You'll be notified when lines move significantly</p>
                  </div>
                ) : (
                  allAlerts.map((item, i) => (
                    <AlertCard 
                      key={i} 
                      alert={item.alert} 
                      gameInfo={item.gameInfo}
                    />
                  ))
                )}
              </TabsContent>
              
              {/* Upcoming Games */}
              <TabsContent value="upcoming" className="mt-6 space-y-4">
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400">No upcoming games being watched</p>
                  </div>
                ) : (
                  filteredEntries.map(entry => (
                    <WatchedGameCard
                      key={entry.id}
                      entry={entry}
                      onRemove={() => removeFromWatchlist(entry.id!)}
                      onUpdateSettings={(settings) => updateSettings(entry.id!, settings)}
                      scope={scope}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
        
        {/* Add games button */}
        <div className="fixed bottom-20 left-0 right-0 p-4 pointer-events-none z-20">
          <div className="container mx-auto max-w-lg">
            <Link to="/picks" className="pointer-events-auto">
              <Button className="w-full gap-2 shadow-lg bg-blue-600 hover:bg-blue-700 shadow-blue-500/25">
                <Plus className="w-4 h-4" />
                Add Games to Watch
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
