import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/react-app/components/admin/AdminStatCard";
import { ProviderHealthCard } from "@/react-app/components/ProviderHealthCard";
import {
  Database,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Zap,
  Calendar,
  TrendingUp,
  Wifi,
  WifiOff,
  Play,
  ChevronDown,
  ChevronUp,
  Key,
  GitBranch,
} from "lucide-react";
import { Button } from "@/react-app/components/ui/button";
import { cn } from "@/react-app/lib/utils";

interface RefreshLog {
  id: number;
  refresh_type: string;
  sport: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  games_processed: number;
  odds_updated: number;
  props_updated: number;
  error_message: string | null;
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  apiKeyConfigured: boolean;
  provider: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    lastSuccessfulCall: string | null;
    lastError: string | null;
    lastErrorTime: string | null;
    callHistory: Array<{
      sport: string;
      endpoint: string;
      success: boolean;
      statusCode: number;
      duration: number;
      timestamp: string;
      errorCategory?: string;
      rawCount?: number;
      processedCount?: number;
    }>;
  };
  database: {
    totalGames: number;
    upcomingGames: number;
    liveGames: number;
    oddsRows: number;
    lastOddsUpdate: string | null;
    lastGameSync: string | null;
  };
}

interface TestResult {
  success: boolean;
  sport: string;
  gamesFound?: number;
  rawCount?: number;
  errors?: string[];
  error?: string;
  sampleGames?: Array<{
    id: string;
    home: string;
    away: string;
    startTime: string;
    status: string;
  }>;
  diagnostic?: {
    endpoint: string;
    statusCode: number;
    duration: number;
  };
}

interface FullSyncResult {
  success: boolean;
  games_inserted: number;
  odds_inserted: number;
  props_inserted: number;
  errors: string[];
  execution_time_ms: number;
  error?: string;
  sport_results?: Array<{
    sport: string;
    games: number;
    odds: number;
    props: number;
    status: string;
    errors: string[];
  }>;
  database_totals?: {
    total_games: number;
    total_odds: number;
    total_props: number;
  };
}

interface SchedulerStatus {
  scheduler_enabled: boolean;
  last_master_run: string | null;
  last_live_run: string | null;
  next_master_run: string | null;
  next_live_run: string | null;
  last_master_result: string | null;
  last_live_result: string | null;
  last_master_error: string | null;
  last_live_error: string | null;
  stats: {
    master_games_inserted: number;
    master_odds_inserted: number;
    master_props_inserted: number;
    live_odds_inserted: number;
  };
  locks: {
    master_lock_active: boolean;
    master_lock_expires: string | null;
    live_lock_active: boolean;
    live_lock_expires: string | null;
  };
}

interface GameCount {
  sport: string;
  status: string;
  count: number;
}

interface LineMovementStats {
  totalLineChanges: number;
  changesLast24h: number;
  sharpShiftsToday: number;
  bySport: Array<{ sport: string; changes: number }>;
}

interface StatusData {
  lock: { locked: boolean; by: string | null; since: string | null };
  activeSports: string[];
  lastRefreshes: RefreshLog[];
  gameCounts: GameCount[];
}

interface NascarValidationData {
  sport: string;
  date: string;
  source: string;
  from_cache: boolean;
  generated_at: string;
  totals: {
    games: number;
    completed: number;
    completed_with_winner: number;
    completed_with_verified_order: number;
  };
  missing: {
    winner_count: number;
    winner_game_ids: string[];
    order_count: number;
    order_game_ids: string[];
  };
}

interface NascarLiveSnapshotTelemetry {
  route: string;
  requests: number;
  successes: number;
  failures: number;
  timeouts: number;
  last_latency_ms: number;
  avg_latency_ms: number;
  thresholds?: {
    warn_timeout_rate_pct: number;
    critical_timeout_rate_pct: number;
    warn_avg_latency_ms: number;
    critical_avg_latency_ms: number;
    warn_success_rate_pct: number;
    critical_success_rate_pct: number;
  };
  generated_at: string;
}

// Sport emoji mapping
const SPORT_ICONS: Record<string, string> = {
  NFL: "🏈",
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  Soccer: "⚽",
  CFB: "🏈",
  CBB: "🏀",
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    COMPLETED: { bg: "bg-green-500/10", text: "text-green-500", icon: <CheckCircle className="h-3 w-3" /> },
    IN_PROGRESS: { bg: "bg-blue-500/10", text: "text-blue-500", icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
    FAILED: { bg: "bg-red-500/10", text: "text-red-500", icon: <XCircle className="h-3 w-3" /> },
  };
  const v = variants[status] || { bg: "bg-gray-500/10", text: "text-gray-500", icon: <Activity className="h-3 w-3" /> };
  
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", v.bg, v.text)}>
      {v.icon}
      {status}
    </span>
  );
}

function RefreshCard({ log }: { log: RefreshLog }) {
  const duration = log.completed_at
    ? Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{SPORT_ICONS[log.sport] || "🎯"}</span>
          <div>
            <p className="font-medium">{log.sport}</p>
            <p className="text-xs text-muted-foreground">{log.refresh_type}</p>
          </div>
        </div>
        <StatusBadge status={log.status} />
      </div>
      
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-secondary/50 rounded-lg p-2">
          <p className="text-lg font-semibold">{log.games_processed}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Games</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2">
          <p className="text-lg font-semibold">{log.odds_updated}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Odds</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2">
          <p className="text-lg font-semibold">{log.props_updated}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Props</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatTimeAgo(log.started_at)}
        </span>
        {duration !== null && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {duration}s
          </span>
        )}
      </div>

      {log.error_message && (
        <div className="mt-3 p-2 bg-red-500/10 rounded-lg">
          <p className="text-xs text-red-500 line-clamp-2">{log.error_message}</p>
        </div>
      )}
    </div>
  );
}

export function AdminSportsData() {
  const NASCAR_TELEMETRY_THRESHOLDS_STORAGE_KEY = "admin.nascarLiveSnapshot.thresholds.v1";
  const [status, setStatus] = useState<StatusData | null>(null);
  const [logs, setLogs] = useState<RefreshLog[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<"master" | "live" | null>(null);
  const [testingSport, setTestingSport] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [fullSyncRunning, setFullSyncRunning] = useState(false);
  const [fullSyncResult, setFullSyncResult] = useState<FullSyncResult | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [togglingScheduler, setTogglingScheduler] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [lineMovementStats, setLineMovementStats] = useState<LineMovementStats | null>(null);
  const [nascarValidation, setNascarValidation] = useState<NascarValidationData | null>(null);
  const [nascarLiveSnapshotTelemetry, setNascarLiveSnapshotTelemetry] = useState<NascarLiveSnapshotTelemetry | null>(null);
  const [customNascarThresholds, setCustomNascarThresholds] = useState<NascarLiveSnapshotTelemetry["thresholds"] | null>(null);
  
  // Manual refresh state
  const [manualSport, setManualSport] = useState('NHL');
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [manualResult, setManualResult] = useState<{
    success: boolean;
    sport?: string;
    dateUsed?: string;
    gamesFromAPI?: number;
    gamesInserted?: number;
    gamesUpdated?: number;
    oddsInserted?: number;
    dbCountsAfter?: { games: number; odds: number };
    durationMs?: number;
    error?: string;
    errors?: string[];
  } | null>(null);
  
  // Demo mode state
  const [demoMode, setDemoMode] = useState<{ enabled: boolean; loading: boolean }>({ enabled: false, loading: true });
  
  // Mode-based refresh state
  const [refreshMode, setRefreshMode] = useState<'master' | 'live' | 'odds' | null>(null);
  const [refreshModeResult, setRefreshModeResult] = useState<{
    ok: boolean;
    mode: string;
    gamesProcessed?: number;
    oddsUpdated?: number;
    propsUpdated?: number;
    durationMs?: number;
    error?: string;
    errors?: string[];
  } | null>(null);
  
  // Populate DB state (for real-world date scanning)
  const [populateRunning, setPopulateRunning] = useState(false);
  const [populateSports, setPopulateSports] = useState<string[]>(['NBA', 'NHL']);
  const [populateResult, setPopulateResult] = useState<{
    success: boolean;
    teamsUpserted: number;
    gamesUpserted: number;
    gamesUpdated: number;
    oddsUpserted: number;
    sampleGames: Array<{ league: string; home: string; away: string; startTime: string }>;
    sportResults: Array<{
      sport: string;
      dateUsed: string | null;
      apiGamesCount: number;
      gamesUpserted: number;
      gamesUpdated: number;
      oddsUpserted: number;
      error?: string;
    }>;
    dbError: string | null;
    totalDbGames: number;
    durationMs: number;
  } | null>(null);

  // Fetch demo mode status
  const fetchDemoMode = async () => {
    try {
      const res = await fetch("/api/sports-data/demo-mode");
      if (res.ok) {
        const data = await res.json();
        setDemoMode({ enabled: data.enabled, loading: false });
      }
    } catch {
      setDemoMode(prev => ({ ...prev, loading: false }));
    }
  };
  
  // Toggle demo mode
  const toggleDemoMode = async () => {
    setDemoMode(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/sports-data/demo-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !demoMode.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setDemoMode({ enabled: data.enabled, loading: false });
      } else {
        setDemoMode(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setDemoMode(prev => ({ ...prev, loading: false }));
    }
  };
  
  // Run populate refresh (scans real-world dates to find games)
  const runPopulateRefresh = async () => {
    setPopulateRunning(true);
    setPopulateResult(null);
    try {
      const res = await fetch('/api/sports-data/refresh/populate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Demo-Mode': 'true'
        },
        credentials: 'include',
        body: JSON.stringify({ sports: populateSports })
      });
      const data = await res.json();
      setPopulateResult(data);
      fetchData(); // Refresh stats after
    } catch (e) {
      setPopulateResult({
        success: false,
        teamsUpserted: 0,
        gamesUpserted: 0,
        gamesUpdated: 0,
        oddsUpserted: 0,
        sampleGames: [],
        sportResults: [],
        dbError: String(e),
        totalDbGames: 0,
        durationMs: 0
      });
    } finally {
      setPopulateRunning(false);
    }
  };

  // Toggle sport selection for populate
  const togglePopulateSport = (sport: string) => {
    setPopulateSports(prev => 
      prev.includes(sport) 
        ? prev.filter(s => s !== sport)
        : [...prev, sport]
    );
  };
  
  // Run mode-based refresh (master/live/odds)
  const runModeRefresh = async (mode: 'master' | 'live' | 'odds') => {
    setRefreshMode(mode);
    setRefreshModeResult(null);
    try {
      const res = await fetch(`/api/sports-data/refresh?mode=${mode}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setRefreshModeResult(data);
      fetchData(); // Refresh stats after
    } catch (e) {
      setRefreshModeResult({
        ok: false,
        mode,
        error: String(e),
      });
    } finally {
      setRefreshMode(null);
    }
  };
  
  const fetchData = async () => {
    try {
      const [statusRes, logsRes, healthRes, schedulerRes, lineMovementRes, nascarValidationRes, nascarLiveSnapshotTelemetryRes] = await Promise.all([
        fetch("/api/sports-data/status"),
        fetch("/api/sports-data/logs?limit=20"),
        fetch("/api/sports-data/health"),
        fetch("/api/sports-data/scheduler/status"),
        fetch("/api/line-movement/admin/stats"),
        fetch("/api/games/nascar/validation"),
        fetch("/api/games/nascar/live-snapshot/telemetry"),
      ]);
      
      if (statusRes.ok) setStatus(await statusRes.json());
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
      }
      if (healthRes.ok) setHealth(await healthRes.json());
      if (schedulerRes.ok) setSchedulerStatus(await schedulerRes.json());
      if (lineMovementRes.ok) {
        const data = await lineMovementRes.json();
        if (data.ok) setLineMovementStats(data.stats);
      }
      if (nascarValidationRes.ok) {
        setNascarValidation(await nascarValidationRes.json());
      }
      if (nascarLiveSnapshotTelemetryRes.ok) {
        setNascarLiveSnapshotTelemetry(await nascarLiveSnapshotTelemetryRes.json());
      }
    } catch (e) {
      console.error("Failed to fetch sports data status:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleScheduler = async () => {
    if (!schedulerStatus) return;
    setTogglingScheduler(true);
    try {
      const res = await fetch("/api/sports-data/scheduler/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !schedulerStatus.scheduler_enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setSchedulerStatus(prev => prev ? { ...prev, scheduler_enabled: data.enabled } : null);
      }
    } catch (e) {
      console.error("Failed to toggle scheduler:", e);
    } finally {
      setTogglingScheduler(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDemoMode();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NASCAR_TELEMETRY_THRESHOLDS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      setCustomNascarThresholds({
        warn_timeout_rate_pct: Number(parsed.warn_timeout_rate_pct) || 1,
        critical_timeout_rate_pct: Number(parsed.critical_timeout_rate_pct) || 5,
        warn_avg_latency_ms: Number(parsed.warn_avg_latency_ms) || 1200,
        critical_avg_latency_ms: Number(parsed.critical_avg_latency_ms) || 2000,
        warn_success_rate_pct: Number(parsed.warn_success_rate_pct) || 97,
        critical_success_rate_pct: Number(parsed.critical_success_rate_pct) || 90,
      });
    } catch {
      // Ignore malformed local threshold config.
    }
  }, []);

  useEffect(() => {
    try {
      if (!customNascarThresholds) {
        window.localStorage.removeItem(NASCAR_TELEMETRY_THRESHOLDS_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          NASCAR_TELEMETRY_THRESHOLDS_STORAGE_KEY,
          JSON.stringify(customNascarThresholds)
        );
      }
    } catch {
      // Ignore storage failures.
    }
  }, [customNascarThresholds, NASCAR_TELEMETRY_THRESHOLDS_STORAGE_KEY]);

  const testSportAPI = async (sport: string) => {
    setTestingSport(sport);
    try {
      const res = await fetch(`/api/sports-data/test/${sport}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [sport]: data }));
      setExpandedTest(sport);
    } catch (e) {
      setTestResults(prev => ({
        ...prev,
        [sport]: { success: false, sport, error: String(e) }
      }));
    } finally {
      setTestingSport(null);
    }
  };

  const triggerRefresh = async (type: "master" | "live") => {
    setRefreshing(type);
    try {
      const res = await fetch(`/api/sports-data/refresh/${type}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Refresh failed");
      }
      // Wait a bit then refetch
      setTimeout(fetchData, 2000);
    } catch (e) {
      console.error("Refresh trigger failed:", e);
    } finally {
      setRefreshing(null);
    }
  };

  const runFullSync = async () => {
    setFullSyncRunning(true);
    setFullSyncResult(null);
    setShowSyncModal(true);
    try {
      const res = await fetch("/api/sports-data/refresh/full-sync", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setFullSyncResult(data);
      fetchData(); // Refresh stats
    } catch (e) {
      setFullSyncResult({
        success: false,
        games_inserted: 0,
        odds_inserted: 0,
        props_inserted: 0,
        errors: [String(e)],
        execution_time_ms: 0,
        error: String(e)
      });
    } finally {
      setFullSyncRunning(false);
    }
  };
  
  const runManualRefresh = async () => {
    setManualRefreshing(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/sports-data/refresh/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sport: manualSport.toLowerCase() })
      });
      const data = await res.json();
      setManualResult(data);
      fetchData(); // Refresh stats
    } catch (e) {
      setManualResult({
        success: false,
        error: String(e)
      });
    } finally {
      setManualRefreshing(false);
    }
  };

  // Compute stats
  const totalGames = status?.gameCounts.reduce((sum, g) => sum + g.count, 0) || 0;
  const liveGames = status?.gameCounts.filter(g => g.status === "LIVE").reduce((sum, g) => sum + g.count, 0) || 0;
  const scheduledGames = status?.gameCounts.filter(g => g.status === "SCHEDULED").reduce((sum, g) => sum + g.count, 0) || 0;
  
  const failedRefreshes = logs.filter(l => l.status === "FAILED").length;
  const healthScore = logs.length > 0 ? Math.round(((logs.length - failedRefreshes) / logs.length) * 100) : 100;
  const serverNascarThresholds = nascarLiveSnapshotTelemetry?.thresholds || {
    warn_timeout_rate_pct: 1,
    critical_timeout_rate_pct: 5,
    warn_avg_latency_ms: 1200,
    critical_avg_latency_ms: 2000,
    warn_success_rate_pct: 97,
    critical_success_rate_pct: 90,
  };
  const effectiveNascarThresholds = customNascarThresholds || serverNascarThresholds;
  const nascarSnapshotRequests = nascarLiveSnapshotTelemetry?.requests ?? 0;
  const nascarSnapshotSuccessRate = nascarSnapshotRequests > 0
    ? Math.round(((nascarLiveSnapshotTelemetry?.successes ?? 0) / nascarSnapshotRequests) * 100)
    : 0;
  const nascarSnapshotTimeoutRate = nascarSnapshotRequests > 0
    ? Math.round(((nascarLiveSnapshotTelemetry?.timeouts ?? 0) / nascarSnapshotRequests) * 100)
    : 0;
  const nascarSnapshotAvgLatency = nascarLiveSnapshotTelemetry?.avg_latency_ms ?? 0;
  const nascarSnapshotAlertLevel: "ok" | "warn" | "critical" =
    nascarSnapshotTimeoutRate > effectiveNascarThresholds.critical_timeout_rate_pct
      || nascarSnapshotAvgLatency > effectiveNascarThresholds.critical_avg_latency_ms
      || nascarSnapshotSuccessRate < effectiveNascarThresholds.critical_success_rate_pct
      ? "critical"
      : nascarSnapshotTimeoutRate > effectiveNascarThresholds.warn_timeout_rate_pct
        || nascarSnapshotAvgLatency > effectiveNascarThresholds.warn_avg_latency_ms
        || nascarSnapshotSuccessRate < effectiveNascarThresholds.warn_success_rate_pct
        ? "warn"
        : "ok";

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title="Sports Data Engine"
        description="Monitor real-time data refresh health and trigger manual syncs"
      />

      {/* Lock Status Banner */}
      {status?.lock.locked && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-amber-500 animate-spin" />
          <div>
            <p className="font-medium text-amber-500">Refresh In Progress</p>
            <p className="text-sm text-muted-foreground">
              {status.lock.by} refresh started {status.lock.since ? formatTimeAgo(status.lock.since) : "recently"}
            </p>
          </div>
        </div>
      )}

      {/* Provider Health Card - Connection Test & Cache Management */}
      <ProviderHealthCard />

      {/* Demo Mode Toggle & Refresh Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Demo Mode Toggle */}
        <div className={cn(
          "border rounded-xl p-4",
          demoMode.enabled ? "bg-amber-500/10 border-amber-500/30" : "bg-card border-border"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                demoMode.enabled ? "bg-amber-500/20" : "bg-secondary"
              )}>
                <Database className={cn("h-5 w-5", demoMode.enabled ? "text-amber-500" : "text-muted-foreground")} />
              </div>
              <div>
                <h3 className="font-semibold">Demo Mode</h3>
                <p className="text-sm text-muted-foreground">
                  {demoMode.enabled 
                    ? "Showing placeholder data when API data unavailable"
                    : "Only real API data is displayed (default)"}
                </p>
              </div>
            </div>
            <Button
              variant={demoMode.enabled ? "destructive" : "outline"}
              size="sm"
              onClick={toggleDemoMode}
              disabled={demoMode.loading}
            >
              {demoMode.loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : demoMode.enabled ? (
                "Disable"
              ) : (
                "Enable"
              )}
            </Button>
          </div>
          {demoMode.enabled && (
            <div className="mt-3 text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2">
              ⚠️ Demo mode is ON. Users will see fake/placeholder games when real data is unavailable.
            </div>
          )}
        </div>

        {/* Mode-Based Refresh Buttons */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-secondary">
              <Zap className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold">Run Refresh Now</h3>
              <p className="text-sm text-muted-foreground">Manually trigger data refresh</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runModeRefresh('master')}
              disabled={refreshMode !== null || status?.lock.locked}
              className="flex-col h-auto py-2"
            >
              {refreshMode === 'master' ? (
                <RefreshCw className="h-4 w-4 animate-spin mb-1" />
              ) : (
                <Database className="h-4 w-4 mb-1" />
              )}
              <span className="text-xs">Master</span>
              <span className="text-[10px] text-muted-foreground">Full sync</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runModeRefresh('live')}
              disabled={refreshMode !== null || status?.lock.locked}
              className="flex-col h-auto py-2"
            >
              {refreshMode === 'live' ? (
                <RefreshCw className="h-4 w-4 animate-spin mb-1" />
              ) : (
                <Activity className="h-4 w-4 mb-1" />
              )}
              <span className="text-xs">Live</span>
              <span className="text-[10px] text-muted-foreground">In-progress</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runModeRefresh('odds')}
              disabled={refreshMode !== null || status?.lock.locked}
              className="flex-col h-auto py-2"
            >
              {refreshMode === 'odds' ? (
                <RefreshCw className="h-4 w-4 animate-spin mb-1" />
              ) : (
                <TrendingUp className="h-4 w-4 mb-1" />
              )}
              <span className="text-xs">Odds</span>
              <span className="text-[10px] text-muted-foreground">Lines only</span>
            </Button>
          </div>
          
          {/* Refresh Result */}
          {refreshModeResult && (
            <div className={cn(
              "mt-3 rounded-lg p-3 text-sm",
              refreshModeResult.ok ? "bg-green-500/10" : "bg-red-500/10"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {refreshModeResult.ok ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className={cn("font-medium", refreshModeResult.ok ? "text-green-500" : "text-red-500")}>
                  {refreshModeResult.mode.toUpperCase()} Refresh {refreshModeResult.ok ? "Complete" : "Failed"}
                </span>
                {refreshModeResult.durationMs && (
                  <span className="text-xs text-muted-foreground ml-auto">{refreshModeResult.durationMs}ms</span>
                )}
              </div>
              {refreshModeResult.ok ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-background/50 rounded p-1">
                    <p className="font-semibold">{refreshModeResult.gamesProcessed || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Games</p>
                  </div>
                  <div className="bg-background/50 rounded p-1">
                    <p className="font-semibold">{refreshModeResult.oddsUpdated || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Odds</p>
                  </div>
                  <div className="bg-background/50 rounded p-1">
                    <p className="font-semibold">{refreshModeResult.propsUpdated || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Props</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{refreshModeResult.error || refreshModeResult.errors?.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* API Health Dashboard */}
      <div className={cn(
        "border rounded-xl p-4",
        health?.status === 'healthy' && "bg-green-500/5 border-green-500/30",
        health?.status === 'degraded' && "bg-amber-500/5 border-amber-500/30",
        health?.status === 'unhealthy' && "bg-red-500/5 border-red-500/30",
        !health && "bg-card border-border"
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {health?.status === 'healthy' && <Wifi className="h-6 w-6 text-green-500" />}
            {health?.status === 'degraded' && <AlertTriangle className="h-6 w-6 text-amber-500" />}
            {health?.status === 'unhealthy' && <WifiOff className="h-6 w-6 text-red-500" />}
            {!health && <Activity className="h-6 w-6 text-muted-foreground animate-pulse" />}
            <div>
              <h3 className="font-semibold text-lg">
                API Health: {health?.status?.toUpperCase() || 'CHECKING...'}
              </h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Key className="h-3 w-3" />
                {health?.apiKeyConfigured ? (
                  <span className="text-green-500">API Key Configured</span>
                ) : (
                  <span className="text-red-500">API Key Missing</span>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Issues List */}
        {health?.issues && health.issues.length > 0 && (
          <div className="mb-4 space-y-2">
            {health.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 text-sm bg-background/50 rounded-lg p-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>{issue}</span>
              </div>
            ))}
          </div>
        )}

        {/* Provider Stats */}
        {health?.provider && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-background/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{health.provider.totalCalls}</p>
              <p className="text-xs text-muted-foreground">Total API Calls</p>
            </div>
            <div className="bg-background/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-500">{health.provider.successfulCalls}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>
            <div className="bg-background/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-500">{health.provider.failedCalls}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="bg-background/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{health.database.totalGames}</p>
              <p className="text-xs text-muted-foreground">Games in DB</p>
            </div>
          </div>
        )}

        {/* Database Stats */}
        {health?.database && (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
            <span>Upcoming: {health.database.upcomingGames}</span>
            <span>Live: {health.database.liveGames}</span>
            <span>Odds Rows: {health.database.oddsRows}</span>
            {health.database.lastOddsUpdate && (
              <span>Last Odds: {formatTimeAgo(health.database.lastOddsUpdate)}</span>
            )}
            {health.database.lastGameSync && (
              <span>Last Sync: {formatTimeAgo(health.database.lastGameSync)}</span>
            )}
          </div>
        )}
      </div>

      {/* NASCAR Results Validation */}
      <div
        id="nascar-results-validation"
        className={cn(
        "border rounded-xl p-4",
        nascarValidation && nascarValidation.missing.winner_count === 0 && nascarValidation.missing.order_count === 0
          ? "bg-green-500/5 border-green-500/30"
          : "bg-amber-500/5 border-amber-500/30"
      )}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">NASCAR Results Validation</h3>
            <p className="text-sm text-muted-foreground">
              Winner and finishing-order coverage from live provider payload
            </p>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            <p>Source: {nascarValidation?.source?.toUpperCase() || "—"}</p>
            <p>Date: {nascarValidation?.date || "—"}</p>
          </div>
        </div>

        {nascarValidation ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{nascarValidation.totals.games}</p>
                <p className="text-xs text-muted-foreground">Games</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{nascarValidation.totals.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-500">{nascarValidation.totals.completed_with_winner}</p>
                <p className="text-xs text-muted-foreground">With Winner</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-500">{nascarValidation.totals.completed_with_verified_order}</p>
                <p className="text-xs text-muted-foreground">With Order</p>
              </div>
            </div>

            {(nascarValidation.missing.winner_count > 0 || nascarValidation.missing.order_count > 0) && (
              <div className="space-y-2 text-xs">
                {nascarValidation.missing.winner_count > 0 && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
                    <p className="font-medium text-amber-400">
                      Missing winners: {nascarValidation.missing.winner_count}
                    </p>
                    <p className="text-muted-foreground break-all">
                      {nascarValidation.missing.winner_game_ids.join(", ")}
                    </p>
                  </div>
                )}
                {nascarValidation.missing.order_count > 0 && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
                    <p className="font-medium text-amber-400">
                      Missing verified order: {nascarValidation.missing.order_count}
                    </p>
                    <p className="text-muted-foreground break-all">
                      {nascarValidation.missing.order_game_ids.join(", ")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading NASCAR validation snapshot...
          </div>
        )}
      </div>

      {/* NASCAR Live Snapshot Telemetry */}
      <div className={cn(
        "border rounded-xl p-4",
        nascarSnapshotAlertLevel === "critical"
          ? "bg-red-500/5 border-red-500/30"
          : nascarSnapshotAlertLevel === "warn"
            ? "bg-amber-500/5 border-amber-500/30"
            : "bg-green-500/5 border-green-500/30"
      )}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">NASCAR Live Snapshot Telemetry</h3>
            <p className="text-sm text-muted-foreground">
              Route health for live polling path
            </p>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            <p>Route: {nascarLiveSnapshotTelemetry?.route || "—"}</p>
            <p>Updated: {nascarLiveSnapshotTelemetry?.generated_at ? formatTimeAgo(nascarLiveSnapshotTelemetry.generated_at) : "—"}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-xs text-muted-foreground">
            Threshold source: {customNascarThresholds ? "custom (browser)" : "server defaults/env"}
          </p>
          <div className="flex items-center gap-2">
            {customNascarThresholds && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setCustomNascarThresholds(null)}
              >
                Use server defaults
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() =>
                setCustomNascarThresholds({
                  warn_timeout_rate_pct: effectiveNascarThresholds.warn_timeout_rate_pct,
                  critical_timeout_rate_pct: effectiveNascarThresholds.critical_timeout_rate_pct,
                  warn_avg_latency_ms: effectiveNascarThresholds.warn_avg_latency_ms,
                  critical_avg_latency_ms: effectiveNascarThresholds.critical_avg_latency_ms,
                  warn_success_rate_pct: effectiveNascarThresholds.warn_success_rate_pct,
                  critical_success_rate_pct: effectiveNascarThresholds.critical_success_rate_pct,
                })
              }
            >
              {customNascarThresholds ? "Edit custom thresholds" : "Customize thresholds"}
            </Button>
          </div>
        </div>

        {nascarLiveSnapshotTelemetry ? (
          <>
            <div
              className={cn(
                "mb-3 rounded-lg border p-2 text-xs",
                nascarSnapshotAlertLevel === "critical"
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : nascarSnapshotAlertLevel === "warn"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-green-500/40 bg-green-500/10 text-green-400"
              )}
            >
              {nascarSnapshotAlertLevel === "critical"
                ? "Alert: Snapshot route is degraded. Check timeout rate and latency now."
                : nascarSnapshotAlertLevel === "warn"
                  ? "Warning: Snapshot route is elevated. Monitor latency and timeout trend."
                  : "Healthy: Snapshot route is within target thresholds."}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{nascarLiveSnapshotTelemetry.requests}</p>
                <p className="text-xs text-muted-foreground">Requests</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-500">{nascarLiveSnapshotTelemetry.successes}</p>
                <p className="text-xs text-muted-foreground">Successes</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-500">{nascarLiveSnapshotTelemetry.failures}</p>
                <p className="text-xs text-muted-foreground">Failures</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{nascarLiveSnapshotTelemetry.timeouts}</p>
                <p className="text-xs text-muted-foreground">Timeouts</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{nascarLiveSnapshotTelemetry.last_latency_ms}</p>
                <p className="text-xs text-muted-foreground">Last ms</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{nascarLiveSnapshotTelemetry.avg_latency_ms}</p>
                <p className="text-xs text-muted-foreground">Avg ms</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{nascarSnapshotSuccessRate}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-border/60 bg-background/40 p-2">
                <span className="text-muted-foreground">Timeout Rate:</span>{" "}
                <span className={nascarSnapshotTimeoutRate > effectiveNascarThresholds.critical_timeout_rate_pct ? "text-red-400" : nascarSnapshotTimeoutRate > effectiveNascarThresholds.warn_timeout_rate_pct ? "text-amber-400" : "text-green-400"}>
                  {nascarSnapshotTimeoutRate}%
                </span>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-2">
                <span className="text-muted-foreground">Avg Latency:</span>{" "}
                <span className={nascarSnapshotAvgLatency > effectiveNascarThresholds.critical_avg_latency_ms ? "text-red-400" : nascarSnapshotAvgLatency > effectiveNascarThresholds.warn_avg_latency_ms ? "text-amber-400" : "text-green-400"}>
                  {nascarSnapshotAvgLatency} ms
                </span>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-2">
                <span className="text-muted-foreground">Thresholds:</span>{" "}
                <span className="text-muted-foreground">
                  warn {effectiveNascarThresholds.warn_timeout_rate_pct}%/{effectiveNascarThresholds.warn_avg_latency_ms}ms/{effectiveNascarThresholds.warn_success_rate_pct}%,
                  crit {effectiveNascarThresholds.critical_timeout_rate_pct}%/{effectiveNascarThresholds.critical_avg_latency_ms}ms/{effectiveNascarThresholds.critical_success_rate_pct}%
                </span>
              </div>
            </div>
            {customNascarThresholds && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                <label className="rounded-md border border-border/60 bg-background/40 p-2">
                  <span className="text-muted-foreground">Warn timeout %</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                    value={customNascarThresholds.warn_timeout_rate_pct}
                    onChange={(e) =>
                      setCustomNascarThresholds((prev) =>
                        prev
                          ? { ...prev, warn_timeout_rate_pct: Math.max(0, Number(e.target.value) || 0) }
                          : prev
                      )
                    }
                  />
                </label>
                <label className="rounded-md border border-border/60 bg-background/40 p-2">
                  <span className="text-muted-foreground">Critical timeout %</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                    value={customNascarThresholds.critical_timeout_rate_pct}
                    onChange={(e) =>
                      setCustomNascarThresholds((prev) =>
                        prev
                          ? { ...prev, critical_timeout_rate_pct: Math.max(0, Number(e.target.value) || 0) }
                          : prev
                      )
                    }
                  />
                </label>
                <label className="rounded-md border border-border/60 bg-background/40 p-2">
                  <span className="text-muted-foreground">Warn avg latency ms</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                    value={customNascarThresholds.warn_avg_latency_ms}
                    onChange={(e) =>
                      setCustomNascarThresholds((prev) =>
                        prev
                          ? { ...prev, warn_avg_latency_ms: Math.max(0, Number(e.target.value) || 0) }
                          : prev
                      )
                    }
                  />
                </label>
                <label className="rounded-md border border-border/60 bg-background/40 p-2">
                  <span className="text-muted-foreground">Critical avg latency ms</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                    value={customNascarThresholds.critical_avg_latency_ms}
                    onChange={(e) =>
                      setCustomNascarThresholds((prev) =>
                        prev
                          ? { ...prev, critical_avg_latency_ms: Math.max(0, Number(e.target.value) || 0) }
                          : prev
                      )
                    }
                  />
                </label>
                <label className="rounded-md border border-border/60 bg-background/40 p-2">
                  <span className="text-muted-foreground">Warn success rate %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                    value={customNascarThresholds.warn_success_rate_pct}
                    onChange={(e) =>
                      setCustomNascarThresholds((prev) =>
                        prev
                          ? { ...prev, warn_success_rate_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }
                          : prev
                      )
                    }
                  />
                </label>
                <label className="rounded-md border border-border/60 bg-background/40 p-2">
                  <span className="text-muted-foreground">Critical success rate %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                    value={customNascarThresholds.critical_success_rate_pct}
                    onChange={(e) =>
                      setCustomNascarThresholds((prev) =>
                        prev
                          ? { ...prev, critical_success_rate_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }
                          : prev
                      )
                    }
                  />
                </label>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading NASCAR live snapshot telemetry...
          </div>
        )}
      </div>

      {/* 🚀 POPULATE DATABASE - Real World Date Scanning */}
      <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Database className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                Populate Database
                <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-500 rounded-full">Recommended</span>
              </h3>
              <p className="text-sm text-muted-foreground">
                Scans real-world dates (Jan-Feb 2025) to find and import games
              </p>
            </div>
          </div>
        </div>

        {/* Sport Selection */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Select Sports to Populate</p>
          <div className="flex flex-wrap gap-2">
            {['NBA', 'NHL', 'NFL', 'MLB'].map(sport => (
              <button
                key={sport}
                onClick={() => togglePopulateSport(sport)}
                disabled={populateRunning}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                  populateSports.includes(sport)
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                    : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{SPORT_ICONS[sport]}</span>
                {sport}
                {populateSports.includes(sport) && <CheckCircle className="h-3 w-3" />}
              </button>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <Button
          onClick={runPopulateRefresh}
          disabled={populateRunning || populateSports.length === 0}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {populateRunning ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Scanning dates and importing games...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Populate Database ({populateSports.length} sport{populateSports.length !== 1 ? 's' : ''})
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          This bypasses the sandbox date (Feb 2026) by using actual dates with game data
        </p>

        {/* Results */}
        {populateResult && (
          <div className={cn(
            "mt-4 rounded-lg p-4 border",
            populateResult.success 
              ? "bg-green-500/10 border-green-500/30" 
              : "bg-red-500/10 border-red-500/30"
          )}>
            <div className="flex items-center gap-2 mb-3">
              {populateResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="font-medium">
                {populateResult.success ? 'Database Populated Successfully' : 'Population Failed'}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {populateResult.durationMs}ms
              </span>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <div className="bg-background/50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-green-500">{populateResult.gamesUpserted}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Games Inserted</p>
              </div>
              <div className="bg-background/50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-blue-500">{populateResult.gamesUpdated}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Games Updated</p>
              </div>
              <div className="bg-background/50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold text-purple-500">{populateResult.oddsUpserted}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Odds Added</p>
              </div>
              <div className="bg-background/50 rounded-lg p-2 text-center">
                <p className="text-xl font-bold">{populateResult.totalDbGames}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Total in DB</p>
              </div>
            </div>

            {/* Per-Sport Results */}
            {populateResult.sportResults.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Results by Sport</p>
                <div className="space-y-2">
                  {populateResult.sportResults.map((sr) => (
                    <div 
                      key={sr.sport}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg text-sm",
                        sr.error ? "bg-red-500/10" : "bg-green-500/10"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span>{SPORT_ICONS[sr.sport] || "🎯"}</span>
                        <span className="font-medium">{sr.sport}</span>
                        {sr.dateUsed && (
                          <span className="text-xs text-muted-foreground">
                            📅 {sr.dateUsed}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {sr.error ? (
                          <span className="text-red-400">{sr.error}</span>
                        ) : (
                          <>
                            <span className="text-green-400">{sr.gamesUpserted} new</span>
                            <span className="text-blue-400">{sr.gamesUpdated} updated</span>
                            <span className="text-purple-400">{sr.oddsUpserted} odds</span>
                            <span className="text-muted-foreground">({sr.apiGamesCount} from API)</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sample Games */}
            {populateResult.sampleGames.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Sample Games Imported</p>
                <div className="space-y-1">
                  {populateResult.sampleGames.map((game, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-background/50 rounded p-2">
                      <span>{SPORT_ICONS[game.league] || "🎯"}</span>
                      <span className="font-medium">{game.away} @ {game.home}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(game.startTime).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DB Error Warning */}
            {populateResult.dbError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Database Write Error
                </p>
                <p className="text-xs text-red-300 mt-1">{populateResult.dbError}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scheduler Status Panel */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-blue-500" />
            <div>
              <h3 className="font-semibold text-lg">Internal Scheduler</h3>
              <p className="text-sm text-muted-foreground">
                Auto-refreshes: Master every 4hr, Live every 20min
              </p>
            </div>
          </div>
          <Button
            variant={schedulerStatus?.scheduler_enabled ? "default" : "outline"}
            size="sm"
            onClick={toggleScheduler}
            disabled={togglingScheduler}
          >
            {togglingScheduler ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : schedulerStatus?.scheduler_enabled ? (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Enabled
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-1" />
                Disabled
              </>
            )}
          </Button>
        </div>

        {schedulerStatus && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Master Refresh */}
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase mb-2">Master Refresh (4hr)</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Run:</span>
                    <span>{schedulerStatus.last_master_run ? formatTimeAgo(schedulerStatus.last_master_run) : 'Never'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next Run:</span>
                    <span>{schedulerStatus.next_master_run ? new Date(schedulerStatus.next_master_run).toLocaleTimeString() : 'Pending'}</span>
                  </div>
                  {schedulerStatus.locks?.master_lock_active && (
                    <div className="text-amber-500 flex items-center gap-1 mt-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Running...
                    </div>
                  )}
                </div>
              </div>

              {/* Live Refresh */}
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase mb-2">Live Refresh (20min)</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Run:</span>
                    <span>{schedulerStatus.last_live_run ? formatTimeAgo(schedulerStatus.last_live_run) : 'Never'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next Run:</span>
                    <span>{schedulerStatus.next_live_run ? new Date(schedulerStatus.next_live_run).toLocaleTimeString() : 'Pending'}</span>
                  </div>
                  {schedulerStatus.locks?.live_lock_active && (
                    <div className="text-amber-500 flex items-center gap-1 mt-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Running...
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Last Sync Stats */}
            {schedulerStatus.stats && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-background/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-semibold">{schedulerStatus.stats.master_games_inserted}</p>
                  <p className="text-[10px] text-muted-foreground">Games</p>
                </div>
                <div className="bg-background/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-semibold">{schedulerStatus.stats.master_odds_inserted}</p>
                  <p className="text-[10px] text-muted-foreground">Master Odds</p>
                </div>
                <div className="bg-background/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-semibold">{schedulerStatus.stats.master_props_inserted}</p>
                  <p className="text-[10px] text-muted-foreground">Props</p>
                </div>
                <div className="bg-background/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-semibold">{schedulerStatus.stats.live_odds_inserted}</p>
                  <p className="text-[10px] text-muted-foreground">Live Odds</p>
                </div>
              </div>
            )}

            {/* Errors */}
            {(schedulerStatus.last_master_error || schedulerStatus.last_live_error) && (
              <div className="space-y-2">
                {schedulerStatus.last_master_error && (
                  <div className="bg-red-500/10 rounded-lg p-2 text-xs text-red-500">
                    <span className="font-medium">Master Error:</span> {schedulerStatus.last_master_error}
                  </div>
                )}
                {schedulerStatus.last_live_error && (
                  <div className="bg-red-500/10 rounded-lg p-2 text-xs text-red-500">
                    <span className="font-medium">Live Error:</span> {schedulerStatus.last_live_error}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!schedulerStatus && (
          <div className="text-center py-4 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading scheduler status...
          </div>
        )}
      </div>

      {/* API Test Panel */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Play className="h-4 w-4" />
          Test API Connectivity
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Test the provider feed for each sport to verify connectivity and inspect sample responses.
        </p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(status?.activeSports || ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer', 'CFB']).map(sport => {
            const result = testResults[sport];
            const isTesting = testingSport === sport;
            const isExpanded = expandedTest === sport;
            
            return (
              <div key={sport} className="space-y-2">
                <Button
                  variant="outline"
                  className={cn(
                    "w-full",
                    result?.success && "border-green-500/50 bg-green-500/5",
                    result && !result.success && "border-red-500/50 bg-red-500/5"
                  )}
                  onClick={() => testSportAPI(sport)}
                  disabled={isTesting || !health?.apiKeyConfigured}
                >
                  {isTesting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <span className="mr-2">{SPORT_ICONS[sport] || "🎯"}</span>
                  )}
                  {sport}
                </Button>
                
                {result && (
                  <button
                    onClick={() => setExpandedTest(isExpanded ? null : sport)}
                    className="w-full text-xs text-center flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {result.success ? (
                      <span className="text-green-500">{result.gamesFound} games</span>
                    ) : (
                      <span className="text-red-500">Failed</span>
                    )}
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Expanded Test Result */}
        {expandedTest && testResults[expandedTest] && (
          <div className="mt-4 bg-secondary/50 rounded-lg p-4 text-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">{expandedTest} API Test Result</h4>
              <button onClick={() => setExpandedTest(null)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            
            {testResults[expandedTest].success ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-background rounded p-2">
                    <p className="font-bold text-green-500">{testResults[expandedTest].gamesFound}</p>
                    <p className="text-xs text-muted-foreground">Processed</p>
                  </div>
                  <div className="bg-background rounded p-2">
                    <p className="font-bold">{testResults[expandedTest].rawCount}</p>
                    <p className="text-xs text-muted-foreground">Raw Count</p>
                  </div>
                  <div className="bg-background rounded p-2">
                    <p className="font-bold">{testResults[expandedTest].diagnostic?.duration || 0}ms</p>
                    <p className="text-xs text-muted-foreground">Response Time</p>
                  </div>
                </div>

                {testResults[expandedTest].sampleGames && testResults[expandedTest].sampleGames!.length > 0 && (
                  <div>
                    <p className="font-medium mb-2">Sample Games:</p>
                    <div className="space-y-1">
                      {testResults[expandedTest].sampleGames!.map((game, i) => (
                        <div key={i} className="bg-background rounded p-2 text-xs">
                          <span className="font-medium">{game.away} @ {game.home}</span>
                          <span className="text-muted-foreground ml-2">
                            {new Date(game.startTime).toLocaleString()} • {game.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-red-500/10 rounded p-3">
                <p className="text-red-500 font-medium">Error</p>
                <p className="text-muted-foreground mt-1">
                  {testResults[expandedTest].error || testResults[expandedTest].errors?.join(', ')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Games"
          value={totalGames}
          icon={Database}
        />
        <AdminStatCard
          label="Live Now"
          value={liveGames}
          icon={Activity}
          trend={liveGames > 0 ? { value: liveGames, isPositive: true } : undefined}
        />
        <AdminStatCard
          label="Scheduled"
          value={scheduledGames}
          icon={Calendar}
        />
        <AdminStatCard
          label="Health Score"
          value={`${healthScore}%`}
          icon={healthScore >= 90 ? CheckCircle : AlertTriangle}
          trend={failedRefreshes > 0 ? { value: failedRefreshes, isPositive: false } : undefined}
        />
      </div>

      {/* Line Movement Intelligence Stats */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <GitBranch className="h-6 w-6 text-amber-500" />
            <div>
              <h3 className="font-semibold text-lg">Line Movement Intelligence</h3>
              <p className="text-sm text-muted-foreground">
                Tracking line changes and sharp shift detection
              </p>
            </div>
          </div>
          {lineMovementStats?.sharpShiftsToday && lineMovementStats.sharpShiftsToday > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">
                {lineMovementStats.sharpShiftsToday} sharp shifts today
              </span>
            </div>
          )}
        </div>

        {lineMovementStats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{lineMovementStats.totalLineChanges}</p>
                <p className="text-xs text-muted-foreground">Total Line Changes</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-500">{lineMovementStats.changesLast24h}</p>
                <p className="text-xs text-muted-foreground">Last 24 Hours</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-500">{lineMovementStats.sharpShiftsToday}</p>
                <p className="text-xs text-muted-foreground">Sharp Shifts Today</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-500">{lineMovementStats.bySport.length}</p>
                <p className="text-xs text-muted-foreground">Sports Tracked</p>
              </div>
            </div>

            {/* Changes by Sport */}
            {lineMovementStats.bySport.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Changes by Sport (24h)</p>
                <div className="flex flex-wrap gap-2">
                  {lineMovementStats.bySport.map(item => (
                    <div 
                      key={item.sport} 
                      className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-1.5"
                    >
                      <span>{SPORT_ICONS[item.sport] || "🎯"}</span>
                      <span className="font-medium">{item.sport}</span>
                      <span className="text-sm text-muted-foreground">{item.changes}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lineMovementStats.totalLineChanges === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <p>No line changes recorded yet.</p>
                <p className="text-xs mt-1">Lines are tracked automatically when odds data is refreshed.</p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading line movement stats...
          </div>
        )}
      </div>

      {/* Manual Refresh Controls */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Manual Refresh
        </h3>
        
        {/* Single Sport Refresh with Auto-Date */}
        <div className="bg-secondary/30 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium mb-3">Single Sport Refresh (Auto-finds date with games)</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={manualSport}
              onChange={(e) => setManualSport(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm"
              disabled={manualRefreshing}
            >
              <option value="NHL">🏒 NHL</option>
              <option value="NBA">🏀 NBA</option>
              <option value="NFL">🏈 NFL</option>
              <option value="MLB">⚾ MLB</option>
              <option value="SOCCER">⚽ Soccer</option>
            </select>
            <Button
              onClick={runManualRefresh}
              disabled={manualRefreshing || fullSyncRunning}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {manualRefreshing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Run Manual Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Auto-scans TODAY-7 to TODAY+14 to find a date with games, then fetches games + odds
          </p>
          
          {/* Manual Refresh Result */}
          {manualResult && (
            <div className={cn(
              "mt-4 rounded-lg p-4",
              manualResult.success ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {manualResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-medium">
                  {manualResult.success ? 'Refresh Successful' : 'Refresh Failed'}
                </span>
              </div>
              
              {manualResult.success ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <div className="bg-background/50 rounded p-2 text-center">
                      <p className="text-lg font-bold">{manualResult.gamesFromAPI}</p>
                      <p className="text-[10px] text-muted-foreground">From API</p>
                    </div>
                    <div className="bg-background/50 rounded p-2 text-center">
                      <p className="text-lg font-bold text-green-500">{manualResult.gamesInserted}</p>
                      <p className="text-[10px] text-muted-foreground">Inserted</p>
                    </div>
                    <div className="bg-background/50 rounded p-2 text-center">
                      <p className="text-lg font-bold text-blue-500">{manualResult.gamesUpdated}</p>
                      <p className="text-[10px] text-muted-foreground">Updated</p>
                    </div>
                    <div className="bg-background/50 rounded p-2 text-center">
                      <p className="text-lg font-bold text-purple-500">{manualResult.oddsInserted}</p>
                      <p className="text-[10px] text-muted-foreground">Odds</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>📅 Date used: <strong>{manualResult.dateUsed}</strong></p>
                    <p>💾 DB now has: <strong>{manualResult.dbCountsAfter?.games} games</strong>, <strong>{manualResult.dbCountsAfter?.odds} odds</strong> for {manualResult.sport}</p>
                    <p>⏱️ Completed in {manualResult.durationMs}ms</p>
                  </div>
                </>
              ) : (
                <div className="text-sm text-red-400">
                  {manualResult.error?.includes('not included in') ? (
                    <p>⚠️ {manualResult.sport} provider feed returned no data. Try a different sport.</p>
                  ) : (
                    <p>{manualResult.error}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={runFullSync}
            disabled={fullSyncRunning || refreshing !== null || status?.lock.locked}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {fullSyncRunning ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Run Full Refresh Now
          </Button>
          <Button
            variant="outline"
            onClick={() => triggerRefresh("master")}
            disabled={refreshing !== null || status?.lock.locked || fullSyncRunning}
          >
            {refreshing === "master" ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            Background Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => triggerRefresh("live")}
            disabled={refreshing !== null || (status?.lock.locked && status.lock.by === "MASTER") || fullSyncRunning}
          >
            {refreshing === "live" ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            Live Mini Refresh
          </Button>
          <Button variant="ghost" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Status
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          "Run Full Refresh Now" syncs all sports and returns detailed results • Scheduled: Master every 4h, Live every 20m
        </p>
      </div>

      {/* Full Sync Result Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                {fullSyncRunning ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    Running Full Refresh...
                  </>
                ) : fullSyncResult?.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Full Refresh Complete
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    Refresh Failed
                  </>
                )}
              </h3>
              <button
                onClick={() => setShowSyncModal(false)}
                className="text-muted-foreground hover:text-foreground"
                disabled={fullSyncRunning}
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {fullSyncRunning ? (
                <div className="flex flex-col items-center py-8">
                  <RefreshCw className="h-12 w-12 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Fetching data from provider feed...</p>
                  <p className="text-xs text-muted-foreground mt-2">This may take 30-60 seconds</p>
                </div>
              ) : fullSyncResult && (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-secondary/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-500">{fullSyncResult.games_inserted}</p>
                      <p className="text-xs text-muted-foreground">Games Inserted</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-500">{fullSyncResult.odds_inserted}</p>
                      <p className="text-xs text-muted-foreground">Odds Inserted</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-purple-500">{fullSyncResult.props_inserted}</p>
                      <p className="text-xs text-muted-foreground">Props Inserted</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold">{(fullSyncResult.execution_time_ms / 1000).toFixed(1)}s</p>
                      <p className="text-xs text-muted-foreground">Execution Time</p>
                    </div>
                  </div>
                  
                  {/* Database Totals */}
                  {fullSyncResult.database_totals && (
                    <div className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Database Totals After Sync</p>
                      <div className="flex gap-4 text-sm">
                        <span>Games: <strong>{fullSyncResult.database_totals.total_games}</strong></span>
                        <span>Odds: <strong>{fullSyncResult.database_totals.total_odds}</strong></span>
                        <span>Props: <strong>{fullSyncResult.database_totals.total_props}</strong></span>
                      </div>
                    </div>
                  )}
                  
                  {/* Per-Sport Results */}
                  {fullSyncResult.sport_results && fullSyncResult.sport_results.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Results by Sport</p>
                      <div className="space-y-2">
                        {fullSyncResult.sport_results.map((sr) => (
                          <div 
                            key={sr.sport} 
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg text-sm",
                              sr.status === 'COMPLETED' ? "bg-green-500/10" : "bg-red-500/10"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span>{SPORT_ICONS[sr.sport] || "🎯"}</span>
                              <span className="font-medium">{sr.sport}</span>
                              <StatusBadge status={sr.status} />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{sr.games} games</span>
                              <span>{sr.odds} odds</span>
                              <span>{sr.props} props</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Errors */}
                  {fullSyncResult.errors && fullSyncResult.errors.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                      <p className="text-sm font-medium text-amber-500 mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Warnings / Errors ({fullSyncResult.errors.length})
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                        {fullSyncResult.errors.slice(0, 20).map((err, i) => (
                          <li key={i} className="truncate">• {err}</li>
                        ))}
                        {fullSyncResult.errors.length > 20 && (
                          <li className="text-amber-500">... and {fullSyncResult.errors.length - 20} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  
                  {/* Fatal Error */}
                  {fullSyncResult.error && !fullSyncResult.success && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-500">Fatal Error</p>
                      <p className="text-xs text-muted-foreground mt-1">{fullSyncResult.error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {!fullSyncRunning && (
              <div className="p-4 border-t border-border flex justify-end">
                <Button onClick={() => setShowSyncModal(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Games by Sport */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Games by Sport
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(status?.activeSports || []).map(sport => {
            const sportCounts = status?.gameCounts.filter(g => g.sport === sport) || [];
            const live = sportCounts.find(s => s.status === "LIVE")?.count || 0;
            const scheduled = sportCounts.find(s => s.status === "SCHEDULED")?.count || 0;
            const final = sportCounts.find(s => s.status === "FINAL")?.count || 0;
            
            return (
              <div key={sport} className="bg-secondary/50 rounded-xl p-3 text-center">
                <span className="text-2xl">{SPORT_ICONS[sport] || "🎯"}</span>
                <p className="font-semibold mt-1">{sport}</p>
                <div className="flex justify-center gap-2 mt-2 text-xs">
                  {live > 0 && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-500 rounded">
                      {live} live
                    </span>
                  )}
                  {scheduled > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-500 rounded">
                      {scheduled}
                    </span>
                  )}
                  {final > 0 && (
                    <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">
                      {final}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Latest Refreshes */}
      <div>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Refresh Activity
        </h3>
        
        {/* Group by sport for latest */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {status?.lastRefreshes.map(log => (
            <RefreshCard key={`${log.sport}-${log.refresh_type}`} log={log} />
          ))}
        </div>

        {/* Full log table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Sport</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Games</th>
                <th className="text-left px-4 py-2 font-medium">Odds</th>
                <th className="text-left px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.slice(0, 10).map((log, i) => (
                <tr key={i} className="hover:bg-secondary/30">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      {SPORT_ICONS[log.sport] || "🎯"} {log.sport}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{log.refresh_type}</td>
                  <td className="px-4 py-2"><StatusBadge status={log.status} /></td>
                  <td className="px-4 py-2">{log.games_processed}</td>
                  <td className="px-4 py-2">{log.odds_updated}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatTimeAgo(log.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
