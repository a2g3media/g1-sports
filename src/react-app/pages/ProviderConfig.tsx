import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Input } from "@/react-app/components/ui/input";
import { Button } from "@/react-app/components/ui/button";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { 
  ArrowLeft, Database, Globe, Key, RefreshCw, CheckCircle2, 
  AlertCircle, Clock, Zap, Shield, ExternalLink, Loader2,
  Radio, Settings2, Activity
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/react-app/lib/utils";

interface Provider {
  id: string;
  name: string;
  description: string;
  logo: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  status: "connected" | "disconnected" | "error" | "demo";
  lastSync?: string;
  features: string[];
  sports: string[];
  pricing?: string;
  docsUrl?: string;
}

interface SportsRadarStatus {
  configured: boolean;
  activeProvider: string;
  lastCheckedAt: string;
  sportCounts: Record<string, number>;
  providerChainStatus?: string;
  remediation?: Array<{ severity: "info" | "warning" | "critical"; message: string; action: string }>;
  partnerAlertSummary?: { total: number; info: number; warning: number; critical: number };
  partnerAlerts?: Array<{ severity: "info" | "warning" | "critical"; message: string; nextAction: string; provider: string }>;
  partnerAlertHistory?: Array<{
    id: number;
    severity: "info" | "warning" | "critical";
    status: "active" | "resolved";
    provider: string;
    message: string;
    acknowledged_at?: string | null;
    snoozed_until?: string | null;
    escalated_at?: string | null;
    escalation_reason?: string | null;
    updated_at: string;
    occurrences: number;
  }>;
}

type ProviderChainProvider = {
  id: string;
  status: "healthy" | "degraded" | "down";
  enabled: boolean;
  keyConfigured?: boolean;
  lastSuccessAt?: string | null;
};

type ProviderHealthApiResponse = {
  status: "healthy" | "degraded" | "unhealthy" | "no_data";
  activeProvider?: string;
  perSportStatus?: Array<{
    sport: string;
    totalGames: number;
    liveGames: number;
    upcomingGames: number;
  }>;
  providerChain?: {
    providers: ProviderChainProvider[];
  };
  remediation?: Array<{ severity: "info" | "warning" | "critical"; message: string; action: string }>;
  partnerAlertSummary?: { total: number; info: number; warning: number; critical: number };
  partnerAlerts?: Array<{ severity: "info" | "warning" | "critical"; message: string; nextAction: string; provider: string }>;
};

type PartnerAlertsApiResponse = {
  history?: Array<{
    id: number;
    severity: "info" | "warning" | "critical";
    status: "active" | "resolved";
    provider: string;
    message: string;
    acknowledged_at?: string | null;
    snoozed_until?: string | null;
    escalated_at?: string | null;
    escalation_reason?: string | null;
    updated_at: string;
    occurrences: number;
  }>;
};

const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: "demo",
    name: "Demo Mode",
    description: "Simulated live scores for testing and development",
    logo: "🎮",
    enabled: true,
    status: "demo",
    features: ["Simulated scores", "Controllable state", "All sports"],
    sports: ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB", "Soccer"],
  },
  {
    id: "espn",
    name: "ESPN",
    description: "Real-time scores from ESPN's public APIs",
    logo: "🏈",
    enabled: false,
    status: "disconnected",
    features: ["Real-time scores", "Team stats", "Game events"],
    sports: ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB"],
    pricing: "Free (public API)",
    docsUrl: "https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b",
  },
  {
    id: "sportsradar",
    name: "SportsRadar",
    description: "Premium sports data and odds from SportsRadar",
    logo: "📈",
    enabled: false,
    status: "disconnected",
    features: ["Live odds", "Scores", "Multi-bookmaker", "Player props"],
    sports: ["NFL", "NBA", "MLB", "NHL", "Soccer", "Golf"],
    pricing: "Enterprise pricing",
    docsUrl: "https://sportradar.com/",
  },
];

function StatusBadge({ status }: { status: Provider["status"] }) {
  const config = {
    connected: { label: "Connected", icon: CheckCircle2, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    disconnected: { label: "Not Configured", icon: AlertCircle, className: "bg-muted text-muted-foreground" },
    error: { label: "Error", icon: AlertCircle, className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    demo: { label: "Demo Mode", icon: Radio, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  }[status];

  const Icon = config.icon;

  return (
    <Badge variant="secondary" className={cn("gap-1", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ProviderCard({ 
  provider, 
  onToggle, 
  onApiKeyChange,
  onSave,
  isSaving,
}: { 
  provider: Provider;
  onToggle: () => void;
  onApiKeyChange: (key: string) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const isDemo = provider.id === "demo";

  return (
    <Card className={cn(
      "transition-all",
      provider.enabled && "ring-2 ring-primary/20"
    )}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center text-2xl",
              provider.enabled 
                ? "bg-gradient-to-br from-primary/20 to-primary/5" 
                : "bg-muted"
            )}>
              {provider.logo}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {provider.name}
                <StatusBadge status={provider.status} />
              </CardTitle>
              <CardDescription className="mt-0.5">
                {provider.description}
              </CardDescription>
            </div>
          </div>
          <Switch 
            checked={provider.enabled} 
            onCheckedChange={onToggle}
            disabled={isDemo} // Demo is always enabled
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Features */}
        <div className="flex flex-wrap gap-1.5">
          {provider.features.map((feature) => (
            <Badge key={feature} variant="outline" className="text-xs font-normal">
              {feature}
            </Badge>
          ))}
        </div>

        {/* Sports */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>{provider.sports.join(" • ")}</span>
        </div>

        {/* Pricing & Docs */}
        {(provider.pricing || provider.docsUrl) && (
          <div className="flex items-center justify-between text-sm">
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
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        {/* API Key Configuration (only for non-demo providers) */}
        {!isDemo && provider.enabled && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={`${provider.id}-api-key`} className="text-sm flex items-center gap-2">
                  <Key className="h-3.5 w-3.5" />
                  API Key
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={`${provider.id}-api-key`}
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter your API key"
                      value={provider.apiKey || ""}
                      onChange={(e) => onApiKeyChange(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <Button onClick={onSave} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>

              {provider.baseUrl !== undefined && (
                <div className="space-y-2">
                  <Label htmlFor={`${provider.id}-base-url`} className="text-sm flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    Base URL (optional)
                  </Label>
                  <Input
                    id={`${provider.id}-base-url`}
                    type="url"
                    placeholder="https://api.example.com"
                    value={provider.baseUrl || ""}
                  />
                </div>
              )}

              {provider.lastSync && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last synced: {new Date(provider.lastSync).toLocaleString()}
                </div>
              )}
            </div>
          </>
        )}

        {/* Demo mode info */}
        {isDemo && (
          <>
            <Separator />
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <Radio className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-700 dark:text-amber-300">Demo Mode Active</p>
                  <p className="text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                    Generating simulated game data. Use the{" "}
                    <Link to="/demo" className="underline hover:text-amber-700 dark:hover:text-amber-300">
                      Demo Control Center
                    </Link>{" "}
                    to simulate score updates and game state changes.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ProviderConfig() {
  const [providers, setProviders] = useState<Provider[]>(DEFAULT_PROVIDERS);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{
    listCacheSize: number;
    singleCacheSize: number;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sportsRadarStatus, setSportsRadarStatus] = useState<SportsRadarStatus | null>(null);
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<"all" | "info" | "warning" | "critical">("all");
  const [alertStatusFilter, setAlertStatusFilter] = useState<"all" | "active" | "resolved">("all");
  const [alertSinceHours, setAlertSinceHours] = useState<number>(72);
  const [alertActionBusyId, setAlertActionBusyId] = useState<number | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const alertParams = new URLSearchParams();
      alertParams.set("limit", "50");
      alertParams.set("include_snoozed", "true");
      if (alertSeverityFilter !== "all") alertParams.set("severity", alertSeverityFilter);
      if (alertStatusFilter !== "all") alertParams.set("status", alertStatusFilter);
      if (alertSinceHours > 0) alertParams.set("since_hours", String(alertSinceHours));

      const [configRes, cacheRes, oddsRes, healthRes, alertsRes] = await Promise.all([
        fetch("/api/games/providers"),
        fetch("/api/games/cache-stats"),
        fetch("/api/games/odds-status"),
        fetch("/api/sports-data/health"),
        fetch(`/api/sports-data/alerts/history?${alertParams.toString()}`),
      ]);
      
      let providersJson: any = {};
      if (configRes.ok) {
        const config = await configRes.json();
        providersJson = config;
      }
      
      if (cacheRes.ok) {
        const stats = await cacheRes.json();
        setCacheStats(stats);
      }

      const [oddsJson, healthJson, alertsJson] = await Promise.all([
        oddsRes.ok ? oddsRes.json() : Promise.resolve({ configured: false }),
        healthRes.ok
          ? healthRes.json() as Promise<ProviderHealthApiResponse>
          : Promise.resolve({ status: "degraded" } as ProviderHealthApiResponse),
        alertsRes.ok
          ? alertsRes.json() as Promise<PartnerAlertsApiResponse>
          : Promise.resolve({ history: [] } as PartnerAlertsApiResponse),
      ]);

      const configProviderMap = new Map<string, any>();
      for (const providerConfig of providersJson.providers || []) {
        if (providerConfig?.id) configProviderMap.set(providerConfig.id, providerConfig);
      }

      const healthProviderMap = new Map<string, ProviderChainProvider>();
      for (const providerHealth of healthJson.providerChain?.providers || []) {
        if (providerHealth?.id) healthProviderMap.set(providerHealth.id, providerHealth);
      }

      setProviders(prev => prev.map((provider) => {
        const configProvider = configProviderMap.get(provider.id) || {};
        const healthProvider = healthProviderMap.get(provider.id);
        const mappedStatus: Provider["status"] = provider.id === "demo"
          ? "demo"
          : !healthProvider
            ? provider.status
            : healthProvider.status === "healthy"
              ? "connected"
              : healthProvider.status === "degraded"
                ? "error"
                : "disconnected";

        return {
          ...provider,
          ...configProvider,
          status: mappedStatus,
          lastSync: healthProvider?.lastSuccessAt || provider.lastSync,
        };
      }));

      const counts: Record<string, number> = { nba: 0, nhl: 0, nfl: 0, ncaaf: 0 };
      for (const row of healthJson.perSportStatus || []) {
        const sport = (row.sport || "").toLowerCase();
        if (sport in counts) counts[sport] = row.totalGames || 0;
      }

      setSportsRadarStatus({
        configured: Boolean(oddsJson.configured),
        activeProvider: healthJson.activeProvider || providersJson.activeProvider || "unknown",
        lastCheckedAt: new Date().toISOString(),
        sportCounts: counts,
        providerChainStatus: healthJson.status,
        remediation: healthJson.remediation || [],
        partnerAlertSummary: healthJson.partnerAlertSummary,
        partnerAlerts: healthJson.partnerAlerts || [],
        partnerAlertHistory: alertsJson.history || [],
      });
    } catch (err) {
      console.error("Failed to load provider config:", err);
    }
  }, [alertSeverityFilter, alertStatusFilter, alertSinceHours]);

  // Load provider config and cache stats
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleToggle = (providerId: string) => {
    setProviders(prev => prev.map(p => 
      p.id === providerId ? { ...p, enabled: !p.enabled } : p
    ));
  };

  const handleApiKeyChange = (providerId: string, apiKey: string) => {
    setProviders(prev => prev.map(p => 
      p.id === providerId ? { ...p, apiKey } : p
    ));
  };

  const handleSave = async (providerId: string) => {
    setIsSaving(providerId);
    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;

      await fetch("/api/games/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          enabled: provider.enabled,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
        }),
      });
      await loadConfig();
    } catch (err) {
      console.error("Failed to save provider config:", err);
    } finally {
      setIsSaving(null);
    }
  };

  const handleClearCache = async () => {
    setIsRefreshing(true);
    try {
      await fetch("/api/games/clear-cache", { method: "POST" });
      await loadConfig();
    } catch (err) {
      console.error("Failed to clear cache:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAcknowledgeAlert = async (id: number) => {
    setAlertActionBusyId(id);
    try {
      await fetch(`/api/sports-data/alerts/${id}/ack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-Mode": "true",
        },
        body: JSON.stringify({ actor: "provider-config", note: "Acknowledged from ProviderConfig" }),
      });
      await loadConfig();
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    } finally {
      setAlertActionBusyId(null);
    }
  };

  const handleSnoozeAlert = async (id: number, minutes = 30) => {
    setAlertActionBusyId(id);
    try {
      await fetch(`/api/sports-data/alerts/${id}/snooze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-Mode": "true",
        },
        body: JSON.stringify({ minutes, reason: "Snoozed from ProviderConfig" }),
      });
      await loadConfig();
    } catch (err) {
      console.error("Failed to snooze alert:", err);
    } finally {
      setAlertActionBusyId(null);
    }
  };

  const activeProvider = providers.find(p => p.enabled && p.status !== "disconnected");

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          to="/settings"
          className="h-10 w-10 rounded-xl bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Score Providers</h1>
          <p className="text-muted-foreground mt-1">
            Configure data sources for real-time game scores
          </p>
        </div>
      </div>

      {/* Status Overview */}
      <Card className="bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Provider</p>
                <p className="text-xl font-bold">
                  {activeProvider?.name || "None"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              {cacheStats && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Cache Size</p>
                  <p className="text-lg font-semibold">
                    {cacheStats.listCacheSize + cacheStats.singleCacheSize} entries
                  </p>
                </div>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleClearCache}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Clear Cache
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadConfig}
                disabled={isRefreshing}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Recheck
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SportsRadar Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            SportsRadar Status
          </CardTitle>
          <CardDescription>
            Quick health snapshot for the current local setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                sportsRadarStatus?.configured
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              )}
            >
              {sportsRadarStatus?.configured ? "API key configured" : "API key missing"}
            </Badge>
            <Badge variant="outline">
              Active provider: {sportsRadarStatus?.activeProvider || "unknown"}
            </Badge>
            {sportsRadarStatus?.providerChainStatus && (
              <Badge variant="outline">
                Readiness: {sportsRadarStatus.providerChainStatus}
              </Badge>
            )}
            {!!sportsRadarStatus?.partnerAlertSummary?.total && (
              <Badge
                variant="secondary"
                className={cn(
                  sportsRadarStatus.partnerAlertSummary.critical > 0
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                )}
              >
                Incidents: {sportsRadarStatus.partnerAlertSummary.total}
              </Badge>
            )}
            {sportsRadarStatus?.lastCheckedAt && (
              <Badge variant="outline">
                Checked: {new Date(sportsRadarStatus.lastCheckedAt).toLocaleTimeString()}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(sportsRadarStatus?.sportCounts || {}).map(([sport, count]) => (
              <div key={sport} className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground uppercase">{sport}</p>
                <p className="text-sm font-semibold">{count} games</p>
              </div>
            ))}
          </div>

          {!!sportsRadarStatus?.remediation?.length && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Operator Actions</p>
              {sportsRadarStatus.remediation.slice(0, 3).map((item, index) => (
                <div key={`${item.message}-${index}`} className="text-sm">
                  <p className="font-medium">{item.message}</p>
                  <p className="text-muted-foreground">{item.action}</p>
                </div>
              ))}
            </div>
          )}

          {!!sportsRadarStatus?.partnerAlerts?.length && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Partner Incidents</p>
              {sportsRadarStatus.partnerAlerts.slice(0, 3).map((alert, index) => (
                <div key={`${alert.message}-${index}`} className="text-sm">
                  <p className="font-medium">{alert.provider}: {alert.message}</p>
                  <p className="text-muted-foreground">{alert.nextAction}</p>
                </div>
              ))}
            </div>
          )}

          {!!sportsRadarStatus?.partnerAlertHistory?.length && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Incident Timeline</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={alertSeverityFilter === "all" ? "default" : "outline"}
                    onClick={() => setAlertSeverityFilter("all")}
                  >
                    All Sev
                  </Button>
                  <Button
                    size="sm"
                    variant={alertSeverityFilter === "critical" ? "default" : "outline"}
                    onClick={() => setAlertSeverityFilter("critical")}
                  >
                    Critical
                  </Button>
                  <Button
                    size="sm"
                    variant={alertStatusFilter === "active" ? "default" : "outline"}
                    onClick={() => setAlertStatusFilter("active")}
                  >
                    Active
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAlertSinceHours((prev) => (prev === 24 ? 72 : 24))}
                  >
                    {alertSinceHours}h
                  </Button>
                </div>
              </div>
              {sportsRadarStatus.partnerAlertHistory.slice(0, 5).map((item, index) => (
                <div key={`${item.provider}-${item.updated_at}-${index}`} className="text-sm flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.provider}: {item.message}</p>
                    <p className="text-muted-foreground">
                      {item.status === "active" ? "Active" : "Resolved"} • {new Date(item.updated_at).toLocaleString()}
                    </p>
                    {(item.escalated_at || item.acknowledged_at || item.snoozed_until) && (
                      <p className="text-muted-foreground">
                        {item.escalated_at ? `Escalated ${new Date(item.escalated_at).toLocaleTimeString()}` : ""}
                        {item.acknowledged_at ? ` • Ack ${new Date(item.acknowledged_at).toLocaleTimeString()}` : ""}
                        {item.snoozed_until ? ` • Snoozed until ${new Date(item.snoozed_until).toLocaleTimeString()}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">x{item.occurrences}</Badge>
                    {item.status === "active" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={alertActionBusyId === item.id}
                          onClick={() => handleAcknowledgeAlert(item.id)}
                        >
                          Ack
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={alertActionBusyId === item.id}
                          onClick={() => handleSnoozeAlert(item.id, 30)}
                        >
                          Snooze 30m
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider Selection Info */}
      <div className="p-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Provider Priority</p>
            <p className="text-muted-foreground mt-1">
              When multiple providers are enabled, POOLVAULT uses them in priority order. 
              If the primary provider fails, it automatically falls back to the next available source.
              Demo mode is always available as the final fallback for testing.
            </p>
          </div>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="space-y-4">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onToggle={() => handleToggle(provider.id)}
            onApiKeyChange={(key) => handleApiKeyChange(provider.id, key)}
            onSave={() => handleSave(provider.id)}
            isSaving={isSaving === provider.id}
          />
        ))}
      </div>

      {/* Integration Guide */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
              <Settings2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Integration Guide</CardTitle>
              <CardDescription>
                How to connect real live score providers
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">1</span>
              </div>
              <div>
                <p className="font-medium">Choose a Provider</p>
                <p className="text-muted-foreground">
                  Select a data provider based on your needs. ESPN's public API is free but limited, 
                  while paid services offer more comprehensive data.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">2</span>
              </div>
              <div>
                <p className="font-medium">Get API Credentials</p>
                <p className="text-muted-foreground">
                  Sign up with your chosen provider and obtain API keys. 
                  Most providers offer free tiers for development and testing.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">3</span>
              </div>
              <div>
                <p className="font-medium">Configure & Test</p>
                <p className="text-muted-foreground">
                  Enter your API key above and enable the provider. The system will automatically 
                  switch from demo mode to live data.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <span className="font-medium">Coming Soon:</span> Full integration with ESPN, SportsData.io, 
                and The Odds API for live production scores. For now, use Demo Mode to test the live scores feature.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
