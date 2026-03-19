import { useState, useEffect, useCallback } from "react";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminStatCard } from "@/react-app/components/admin/AdminStatCard";
import { AdminHealthIndicator } from "@/react-app/components/admin/AdminHealthIndicator";
import { Button } from "@/react-app/components/ui/button";
import { Badge } from "@/react-app/components/ui/badge";
import { Switch } from "@/react-app/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Separator } from "@/react-app/components/ui/separator";
import { cn } from "@/react-app/lib/utils";
import {
  RefreshCw,
  Database,
  Radio,
  Zap,
  CheckCircle2,
  AlertCircle,
  Globe,
  Activity,
  Clock,
  ExternalLink,
  Loader2,
  TrendingUp,
  DollarSign,
} from "lucide-react";

interface ProviderStatus {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  status: "connected" | "disconnected" | "error" | "demo";
  lastCheck?: string;
  sports: string[];
  features: string[];
  apiKeyConfigured: boolean;
  docsUrl?: string;
  pricing?: string;
  stats?: {
    requestsToday?: number;
    cacheHitRate?: number;
    avgLatency?: number;
    errorRate?: number;
  };
}

interface ProviderData {
  providers: ProviderStatus[];
  activeProvider: string | null;
  cacheStats: {
    totalEntries: number;
    hitRate: number;
  };
  sportsAvailability: {
    nba: number;
    nhl: number;
    nfl: number;
    ncaaf: number;
  };
  fallbackInUse: boolean;
  oddsApiStatus?: {
    configured: boolean;
    remainingQuota?: number;
    quotaUsed?: number;
    availableSports: string[];
  };
}

interface SportDiagnosis {
  sport: string;
  provider: string;
  gameCount: number;
  usingFallback: boolean;
  reason: string;
  fixTip: string;
  fixCommand: string;
}

interface NascarValidationSnapshot {
  totals?: {
    completed?: number;
  };
  missing?: {
    winner_count?: number;
    order_count?: number;
  };
}

function StatusBadge({ status }: { status: ProviderStatus["status"] }) {
  const config = {
    connected: {
      label: "Live",
      icon: CheckCircle2,
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
    disconnected: {
      label: "Not Configured",
      icon: AlertCircle,
      className: "bg-muted text-muted-foreground",
    },
    error: {
      label: "Error",
      icon: AlertCircle,
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    demo: {
      label: "Demo",
      icon: Radio,
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    },
  }[status];

  const Icon = config.icon;

  return (
    <Badge variant="secondary" className={cn("gap-1.5", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ProviderRow({
  provider,
  isActive,
  onToggle,
}: {
  provider: ProviderStatus;
  isActive: boolean;
  onToggle: () => void;
}) {
  const isDemo = provider.id === "demo";

  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-all",
        isActive
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:border-border/80"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center text-xl shrink-0",
              isActive ? "bg-primary/10" : "bg-muted"
            )}
          >
            {provider.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{provider.name}</h3>
              <StatusBadge status={provider.status} />
              {isActive && (
                <Badge className="bg-primary/10 text-primary border-0">
                  <Zap className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {provider.description}
            </p>

            {/* Sports & Features */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {provider.sports.slice(0, 5).map((sport) => (
                <Badge key={sport} variant="outline" className="text-xs font-normal">
                  {sport}
                </Badge>
              ))}
              {provider.sports.length > 5 && (
                <Badge variant="outline" className="text-xs font-normal">
                  +{provider.sports.length - 5} more
                </Badge>
              )}
            </div>

            {/* Stats row */}
            {provider.stats && (
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                {provider.stats.requestsToday !== undefined && (
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {provider.stats.requestsToday.toLocaleString()} requests today
                  </span>
                )}
                {provider.stats.cacheHitRate !== undefined && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {provider.stats.cacheHitRate}% cache hit
                  </span>
                )}
                {provider.stats.avgLatency !== undefined && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {provider.stats.avgLatency}ms avg
                  </span>
                )}
              </div>
            )}

            {/* Links */}
            {(provider.docsUrl || provider.pricing) && (
              <div className="flex items-center gap-3 mt-2 text-xs">
                {provider.pricing && (
                  <span className="text-muted-foreground">{provider.pricing}</span>
                )}
                {provider.docsUrl && (
                  <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Docs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isDemo && (
            <Switch
              checked={provider.enabled}
              onCheckedChange={onToggle}
              disabled={!provider.apiKeyConfigured}
            />
          )}
        </div>
      </div>

      {/* Warning for unconfigured providers */}
      {!isDemo && provider.enabled && !provider.apiKeyConfigured && (
        <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            API key not configured. Add the secret in your environment to enable live data.
          </p>
        </div>
      )}
    </div>
  );
}

export function AdminProviders() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [nascarValidation, setNascarValidation] = useState<NascarValidationSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisRows, setDiagnosisRows] = useState<SportDiagnosis[]>([]);
  const [copiedSport, setCopiedSport] = useState<string | null>(null);
  const [copiedRunbook, setCopiedRunbook] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [providersRes, cacheRes, oddsRes] = await Promise.all([
        fetch("/api/games/providers"),
        fetch("/api/games/cache-stats"),
        fetch("/api/games/odds-status"),
      ]);

      const providersData = providersRes.ok ? await providersRes.json() : {};
      const cacheData = cacheRes.ok ? await cacheRes.json() : {};
      const oddsData = oddsRes.ok ? await oddsRes.json() : {};
      try {
        const validationRes = await fetch("/api/games/nascar/validation");
        const validationData = validationRes.ok ? await validationRes.json() : null;
        setNascarValidation(validationData);
      } catch {
        setNascarValidation(null);
      }
      const gamesRes = await fetch("/api/games?sports=nba,nhl,nfl,ncaaf");
      const gamesData = gamesRes.ok ? await gamesRes.json() : { games: [], provider: "unknown" };
      const sportsAvailability = { nba: 0, nhl: 0, nfl: 0, ncaaf: 0 };
      for (const game of gamesData.games || []) {
        const sport = (game.sport || "").toLowerCase();
        if (sport in sportsAvailability) {
          sportsAvailability[sport as keyof typeof sportsAvailability] += 1;
        }
      }

      // Build provider list with real status
      const providers: ProviderStatus[] = [
        {
          id: "espn",
          name: "ESPN",
          description: "Real-time scores via ESPN's public API",
          icon: "🏈",
          enabled: providersData.providers?.espn?.enabled ?? true,
          status: providersData.providers?.espn?.status ?? "connected",
          sports: ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "Soccer"],
          features: ["Real-time scores", "Play-by-play", "Team stats", "Schedules"],
          apiKeyConfigured: true, // ESPN is public, no key needed
          docsUrl: "https://site.api.espn.com",
          pricing: "Free (public API)",
          stats: {
            requestsToday: providersData.providers?.espn?.requestsToday ?? 0,
            cacheHitRate: Math.round(cacheData.hitRate ?? 85),
            avgLatency: providersData.providers?.espn?.avgLatency ?? 120,
          },
        },
        {
          id: "sportsradar",
          name: "SportsRadar",
          description: "Premium sports data and live odds",
          icon: "📈",
          enabled: oddsData.configured ?? false,
          status: oddsData.configured ? "connected" : "disconnected",
          sports: oddsData.availableSports ?? ["NFL", "NBA", "MLB", "NHL", "Soccer", "Golf"],
          features: ["Live odds", "Multiple bookmakers", "Spreads & totals", "Moneylines", "Player props"],
          apiKeyConfigured: oddsData.configured ?? false,
          docsUrl: "https://sportradar.com/",
          pricing: "Enterprise pricing",
          stats: oddsData.configured
            ? {
                requestsToday: oddsData.quotaUsed ?? 0,
                cacheHitRate: 90,
              }
            : undefined,
        },
        {
          id: "demo",
          name: "Demo Mode",
          description: "Simulated data for testing and development",
          icon: "🎮",
          enabled: true,
          status: "demo",
          sports: ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "Soccer"],
          features: ["Simulated scores", "Controllable state", "Always available"],
          apiKeyConfigured: true,
        },
      ];

      setData({
        providers,
        activeProvider: providersData.activeProvider ?? "espn",
        cacheStats: {
          totalEntries: (cacheData.listCacheSize ?? 0) + (cacheData.singleCacheSize ?? 0),
          hitRate: cacheData.hitRate ?? 0,
        },
        sportsAvailability,
        fallbackInUse:
          Boolean(oddsData.configured) &&
          (providersData.activeProvider ?? gamesData.provider ?? "espn") !== "sportsradar",
        oddsApiStatus: oddsData.configured
          ? {
              configured: true,
              remainingQuota: oddsData.remainingQuota,
              quotaUsed: oddsData.quotaUsed,
              availableSports: oddsData.availableSports ?? [],
            }
          : undefined,
      });
    } catch (err) {
      console.error("Failed to fetch provider data:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async (providerId: string) => {
    if (!data) return;

    const provider = data.providers.find((p) => p.id === providerId);
    if (!provider) return;

    // Optimistically update
    setData({
      ...data,
      providers: data.providers.map((p) =>
        p.id === providerId ? { ...p, enabled: !p.enabled } : p
      ),
    });

    try {
      await fetch("/api/games/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          enabled: !provider.enabled,
        }),
      });
    } catch (err) {
      console.error("Failed to toggle provider:", err);
      // Revert on error
      setData({
        ...data,
        providers: data.providers.map((p) =>
          p.id === providerId ? { ...p, enabled: provider.enabled } : p
        ),
      });
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      await fetch("/api/games/clear-cache", { method: "POST" });
      await fetchData();
    } catch (err) {
      console.error("Failed to clear cache:", err);
    } finally {
      setIsClearingCache(false);
    }
  };

  const runFallbackDiagnosis = async () => {
    setIsDiagnosing(true);
    try {
      const sports = ["nfl", "nba", "nhl", "ncaaf"];
      const responses = await Promise.all(
        sports.map(async (sport) => {
          const res = await fetch(`/api/games?sport=${sport}`);
          const body = res.ok ? await res.json() : { provider: "unknown", games: [] };
          const provider = String(body.provider || "unknown").toLowerCase();
          const gameCount = Array.isArray(body.games) ? body.games.length : 0;
          const keyConfigured = Boolean(data?.oddsApiStatus?.configured);
          const usingFallback = keyConfigured && provider !== "sportsradar";

          let reason = "SportsRadar active";
          let fixTip = "No action needed.";
          let fixCommand = "echo \"No fix needed: SportsRadar is active for this sport.\"";
          if (!keyConfigured) {
            reason = "SPORTSRADAR_API_KEY is missing";
            fixTip = "Add SPORTSRADAR_API_KEY in .dev.vars, then restart dev server.";
            fixCommand = [
              "cd \"/Users/georgemattia/Downloads/GZ Master!\"",
              "open .dev.vars",
              "# set SPORTSRADAR_API_KEY=your_real_key",
              "npm run dev:clean",
            ].join("\n");
          } else if (provider === "sportsradar" && gameCount === 0) {
            reason = "SportsRadar returned no games for this date";
            fixTip = "Try another sport/date, or confirm this competition has active events today.";
            fixCommand = `curl "http://localhost:5173/api/games?sport=${sport}&date=$(date +%Y-%m-%d)"`;
          } else if (usingFallback) {
            reason = "SportsRadar unavailable for this sport; using ESPN fallback";
            fixTip = "Check SportsRadar sport coverage and API access tier for this league.";
            fixCommand = `curl "http://localhost:5173/api/games?sport=${sport}"`;
          }

          return {
            sport: sport.toUpperCase(),
            provider: provider.toUpperCase(),
            gameCount,
            usingFallback,
            reason,
            fixTip,
            fixCommand,
          } as SportDiagnosis;
        })
      );
      setDiagnosisRows(responses);
      setShowDiagnosis(true);
    } catch (err) {
      console.error("Failed to run SportsRadar diagnosis:", err);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const copyFixCommand = async (row: SportDiagnosis) => {
    try {
      await navigator.clipboard.writeText(row.fixCommand);
      setCopiedSport(row.sport);
      setTimeout(() => setCopiedSport(null), 1500);
    } catch (err) {
      console.error("Failed to copy fix command:", err);
    }
  };

  const copyRunbookCommands = async () => {
    const commands = [
      "cd \"/Users/georgemattia/Downloads/GZ Master!\"",
      "npm run dev:clean",
      "curl \"http://localhost:5173/api/games?sport=nba\"",
      "curl \"http://localhost:5173/api/games/odds-status\"",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(commands);
      setCopiedRunbook(true);
      setTimeout(() => setCopiedRunbook(false), 1500);
    } catch (err) {
      console.error("Failed to copy runbook commands:", err);
    }
  };

  const hasNascarValidationGap =
    (nascarValidation?.totals?.completed ?? 0) > 0 &&
    ((nascarValidation?.missing?.winner_count ?? 0) > 0 ||
      (nascarValidation?.missing?.order_count ?? 0) > 0);

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Data Providers"
        description="Configure live sports data sources"
        actions={
          <div className="flex items-center gap-2">
            <a href="/admin/sports-data#nascar-results-validation">
              <Badge
                variant="secondary"
                className={cn(
                  "h-8 px-2.5 rounded-md",
                  hasNascarValidationGap
                    ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300"
                )}
                title="Open NASCAR validation details"
              >
                NASCAR Validation: {hasNascarValidationGap ? "Needs attention" : "Healthy"}
              </Badge>
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="h-8"
            >
              {isClearingCache ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Database className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear Cache
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={isRefreshing}
              className="h-8"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* 1-minute Recovery Runbook */}
        <Card className="border-dashed bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1-Minute Recovery Runbook</CardTitle>
            <CardDescription>
              Fast checklist to restore local data routes and SportsRadar status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              1) Restart dev with clean cache, 2) verify games API, 3) verify odds status, 4) refresh this page.
            </div>
            <Button variant="outline" size="sm" onClick={copyRunbookCommands}>
              {copiedRunbook ? "Copied runbook commands" : "Copy runbook commands"}
            </Button>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Status Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminStatCard
              label="Active Provider"
              value={data?.activeProvider ? data.providers.find(p => p.id === data.activeProvider)?.name || "—" : "—"}
              icon={Globe}
            />
            <AdminStatCard
              label="Cache Entries"
              value={data?.cacheStats?.totalEntries?.toLocaleString() ?? "—"}
              icon={Database}
            />
            <AdminStatCard
              label="Cache Hit Rate"
              value={data?.cacheStats?.hitRate ? `${data.cacheStats.hitRate}%` : "—"}
              icon={TrendingUp}
            />
            <AdminStatCard
              label="Odds API Quota"
              value={
                data?.oddsApiStatus?.configured
                  ? data.oddsApiStatus.remainingQuota?.toLocaleString() ?? "Active"
                  : "Not Configured"
              }
              icon={DollarSign}
            />
          </div>
        </section>

        {/* SportsRadar-only Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">SportsRadar Status</CardTitle>
            <CardDescription>
              API key, provider routing, and per-sport availability
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="secondary"
                className={
                  data?.oddsApiStatus?.configured
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }
              >
                {data?.oddsApiStatus?.configured ? "Key loaded" : "Key missing"}
              </Badge>
              <Badge variant="outline">
                Active: {data?.activeProvider?.toUpperCase() ?? "UNKNOWN"}
              </Badge>
              <Badge variant="outline">
                {data?.fallbackInUse ? "Fallback in use" : "Primary active"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (showDiagnosis) {
                    setShowDiagnosis(false);
                  } else {
                    runFallbackDiagnosis();
                  }
                }}
                disabled={isDiagnosing}
                className="h-6 px-2 text-xs"
              >
                {isDiagnosing ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Diagnosing...
                  </>
                ) : showDiagnosis ? (
                  "Hide diagnosis"
                ) : (
                  "Diagnose fallback"
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(data?.sportsAvailability ?? {}).map(([sport, count]) => (
                <div key={sport} className="rounded-md border p-2">
                  <p className="text-xs text-muted-foreground uppercase">{sport}</p>
                  <p className="text-sm font-semibold">{count} games</p>
                </div>
              ))}
            </div>

            {showDiagnosis && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Per-sport fallback diagnosis
                </p>
                <div className="space-y-2">
                  {diagnosisRows.map((row) => (
                    <div
                      key={row.sport}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{row.sport}</Badge>
                        <Badge
                          variant="secondary"
                          className={
                            row.usingFallback
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }
                        >
                          {row.provider}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{row.gameCount} games</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{row.reason}</p>
                      <p className="w-full text-xs text-primary/90">
                        Fix tip: {row.fixTip}
                      </p>
                      <div className="w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => copyFixCommand(row)}
                        >
                          {copiedSport === row.sport ? "Copied" : "Copy fix commands"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Provider Health
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AdminHealthIndicator
              label="ESPN API"
              status={
                data?.providers.find((p) => p.id === "espn")?.status === "connected"
                  ? "OK"
                  : data?.providers.find((p) => p.id === "espn")?.status === "error"
                  ? "DOWN"
                  : "DEGRADED"
              }
            />
            <AdminHealthIndicator
              label="The Odds API"
              status={
                data?.oddsApiStatus?.configured
                  ? "OK"
                  : "DEGRADED"
              }
              detail={!data?.oddsApiStatus?.configured ? "API key not set" : undefined}
            />
            <AdminHealthIndicator
              label="Demo Fallback"
              status="OK"
              detail="Always available"
            />
          </div>
        </section>

        <Separator />

        {/* Provider List */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Configured Providers</h2>
              <p className="text-sm text-muted-foreground">
                Providers are used in priority order. If one fails, the next is tried automatically.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading providers...
              </div>
            ) : (
              data?.providers.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  isActive={data.activeProvider === provider.id}
                  onToggle={() => handleToggle(provider.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* The Odds API Details */}
        {data?.oddsApiStatus?.configured && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">📈</span>
                The Odds API Usage
              </CardTitle>
              <CardDescription>
                Monthly quota and available sports
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Quota Used</p>
                  <p className="text-lg font-semibold">
                    {data.oddsApiStatus.quotaUsed?.toLocaleString() ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-lg font-semibold">
                    {data.oddsApiStatus.remainingQuota?.toLocaleString() ?? "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Available Sports</p>
                  <div className="flex flex-wrap gap-1">
                    {data.oddsApiStatus.availableSports.map((sport) => (
                      <Badge key={sport} variant="outline" className="text-xs">
                        {sport}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help Section */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">How Provider Priority Works</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  GZ Sports fetches live scores from ESPN by default. If ESPN is unavailable,
                  the system automatically falls back to demo data. SportsRadar provides
                  betting lines and odds data.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  To enable SportsRadar odds, add the{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">SPORTSRADAR_API_KEY</code>{" "}
                  secret in your environment settings.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
