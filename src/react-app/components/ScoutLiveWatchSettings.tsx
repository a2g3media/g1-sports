/**
 * Scout Live Watch Settings Component
 * 
 * Allows users to configure Scout's live game watching preferences:
 * - Which sports to watch
 * - Alert types (scoring events, period summaries, dominant performance)
 * - Delivery channels
 * - Rate limiting
 * 
 * Premium feature - requires SCOUT_LIVE_INTELLIGENCE subscription
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { Button } from "@/react-app/components/ui/button";
import { Separator } from "@/react-app/components/ui/separator";
import { 
  Eye, Radio, TrendingUp, Crown, CheckCircle, Loader2,
  Bell, Zap, Mail, Trophy, Activity, AlertCircle, Info, Grid3X3, ChevronRight, Lock
} from "lucide-react";
import { cn } from "@/react-app/lib/utils";

interface ScoutLiveWatchPreferences {
  // Master toggle
  enabled: boolean;
  
  // Sports to watch
  sports: {
    nfl: boolean;
    nba: boolean;
    mlb: boolean;
    nhl: boolean;
    ncaaf: boolean;
    ncaab: boolean;
    soccer: boolean;
    tennis: boolean;
    golf: boolean;
    mma: boolean;
    boxing: boolean;
  };
  
  // Alert types
  alertTypes: {
    scoringEvents: boolean;        // Every score
    periodSummaries: boolean;       // End of quarters/innings/periods
    dominantPerformance: boolean;   // No-hitters, scoring runs, etc.
  };
  
  // Delivery channels
  channels: {
    push: boolean;
    inApp: boolean;
    email: boolean;
  };
  
  // Rate limiting
  rateLimiting: {
    maxAlertsPerHour: number;  // 0 = unlimited
  };
}

const DEFAULT_PREFERENCES: ScoutLiveWatchPreferences = {
  enabled: false,
  sports: {
    nfl: true,
    nba: true,
    mlb: false,
    nhl: false,
    ncaaf: false,
    ncaab: false,
    soccer: false,
    tennis: false,
    golf: false,
    mma: false,
    boxing: false,
  },
  alertTypes: {
    scoringEvents: true,
    periodSummaries: true,
    dominantPerformance: true,
  },
  channels: {
    push: true,
    inApp: true,
    email: false,
  },
  rateLimiting: {
    maxAlertsPerHour: 20,
  },
};

const SPORT_LABELS: Record<keyof ScoutLiveWatchPreferences['sports'], string> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ncaaf: "NCAA Football",
  ncaab: "NCAA Basketball",
  soccer: "Soccer",
  tennis: "Tennis",
  golf: "Golf",
  mma: "MMA",
  boxing: "Boxing",
};

export function ScoutLiveWatchSettings() {
  const { features, isAtLeast, loading: subscriptionLoading } = useSubscription();
  const isPremium = features?.hasLiveCommentary || false;
  const isElite = isAtLeast('scout_elite');
  const [preferences, setPreferences] = useState<ScoutLiveWatchPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  
  // Load preferences
  useEffect(() => {
    if (!isPremium) {
      setLoading(false);
      return;
    }
    const loadData = async () => {
      try {
        // Preferred endpoint for full Scout Live Watch preferences.
        const prefRes = await fetch("/api/scout/live-watch/preferences");
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          setPreferences(prev => ({ ...prev, ...prefData }));
        } else if (prefRes.status === 404) {
          // Fallback to legacy auto-watch endpoint when full prefs route is unavailable.
          const fallbackRes = await fetch("/api/live-watcher/settings/auto-watch");
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json() as { enabled?: boolean };
            const enabled = fallbackData.enabled;
            if (typeof enabled === "boolean") {
              setPreferences(prev => ({ ...prev, enabled }));
            }
          }
        }
      } catch (err) {
        console.error("Failed to load Scout Live Watch preferences:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isPremium]);
  
  const savePreferences = async (newPrefs: ScoutLiveWatchPreferences) => {
    setSaveStatus("saving");
    try {
      let res = await fetch("/api/scout/live-watch/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPrefs),
      });
      if (res.status === 404) {
        res = await fetch("/api/live-watcher/settings/auto-watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: newPrefs.enabled }),
        });
      }
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  };
  
  const updatePreference = <K extends keyof ScoutLiveWatchPreferences>(
    key: K,
    value: ScoutLiveWatchPreferences[K]
  ) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    if (isPremium) {
      savePreferences(newPrefs);
    }
  };
  
  const updateSport = (sport: keyof ScoutLiveWatchPreferences['sports'], enabled: boolean) => {
    const newSports = { ...preferences.sports, [sport]: enabled };
    const newPrefs = { ...preferences, sports: newSports };
    setPreferences(newPrefs);
    if (isPremium) {
      savePreferences(newPrefs);
    }
  };
  
  const updateAlertType = (type: keyof ScoutLiveWatchPreferences['alertTypes'], enabled: boolean) => {
    const newAlertTypes = { ...preferences.alertTypes, [type]: enabled };
    const newPrefs = { ...preferences, alertTypes: newAlertTypes };
    setPreferences(newPrefs);
    if (isPremium) {
      savePreferences(newPrefs);
    }
  };
  
  const updateChannel = (channel: keyof ScoutLiveWatchPreferences['channels'], enabled: boolean) => {
    const newChannels = { ...preferences.channels, [channel]: enabled };
    const newPrefs = { ...preferences, channels: newChannels };
    setPreferences(newPrefs);
    if (isPremium) {
      savePreferences(newPrefs);
    }
  };
  
  if (loading || subscriptionLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  // Premium upsell if not subscribed
  if (!isPremium) {
    return (
      <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Eye className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Scout Live Watch
                <Badge variant="secondary" className="bg-primary/10 text-primary font-semibold">
                  <Crown className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              </CardTitle>
              <CardDescription>
                Real-time game commentary and intelligent alerts
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Scout Live Watch monitors your followed games in real-time and delivers intelligent, 
              neutral commentary via push notifications and in-app alerts.
            </p>
            
            <div className="grid gap-3 mt-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Trophy className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Every Scoring Event</p>
                  <p className="text-xs text-muted-foreground">
                    Instant alerts on touchdowns, baskets, goals, and runs with contextual analysis
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Activity className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Period-by-Period Summaries</p>
                  <p className="text-xs text-muted-foreground">
                    Scout analyzes each quarter, inning, and period — even scoreless ones
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Dominant Performance Alerts</p>
                  <p className="text-xs text-muted-foreground">
                    No-hitters, scoring runs, defensive stands, and milestone watches
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
            <div>
              <p className="font-semibold text-primary">$25/month</p>
              <p className="text-xs text-muted-foreground">Premium Scout Intelligence</p>
            </div>
            <Button className="bg-primary hover:bg-primary/90">
              <Crown className="h-4 w-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Premium user settings
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Scout Live Watch
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                  Active
                </Badge>
              </CardTitle>
              <CardDescription>
                Real-time game monitoring and intelligent alerts
              </CardDescription>
            </div>
          </div>
          {saveStatus !== "idle" && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all",
              saveStatus === "saving" && "bg-muted text-muted-foreground",
              saveStatus === "saved" && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
              saveStatus === "error" && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
            )}>
              {saveStatus === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saveStatus === "saved" && <CheckCircle className="h-3.5 w-3.5" />}
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Error"}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className={cn(
          "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
          preferences.enabled 
            ? "border-primary bg-primary/5" 
            : "border-border"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              preferences.enabled ? "bg-primary/10" : "bg-muted"
            )}>
              <Radio className={cn(
                "h-5 w-5",
                preferences.enabled ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className="font-medium">Scout is Watching</p>
              <p className="text-sm text-muted-foreground">
                {preferences.enabled ? "Monitoring followed games in real-time" : "Live watching is paused"}
              </p>
            </div>
          </div>
          <Switch 
            checked={preferences.enabled} 
            onCheckedChange={(checked) => updatePreference("enabled", checked)}
          />
        </div>
        
        {/* Elite Command Center CTA */}
        <Link 
          to="/elite/command-center"
          className={cn(
            "flex items-center justify-between p-4 rounded-xl border transition-all group",
            isElite 
              ? "border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:border-amber-500/50"
              : "border-border hover:border-muted-foreground/30"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              isElite ? "bg-amber-500/20" : "bg-muted"
            )}>
              {isElite ? (
                <Grid3X3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <Lock className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium flex items-center gap-2">
                Command Center
                {!isElite && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                    Elite
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {isElite 
                  ? "Multi-game grid with real-time Scout intelligence" 
                  : "Upgrade to Elite for the multi-game command center"}
              </p>
            </div>
          </div>
          <ChevronRight className={cn(
            "h-5 w-5 transition-transform group-hover:translate-x-0.5",
            isElite ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          )} />
        </Link>
        
        <Separator />
        
        {/* Sports Selection */}
        <div className="space-y-3">
          <div>
            <Label className="text-base">Sports to Watch</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Scout will monitor games for the sports you select
            </p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(SPORT_LABELS) as Array<keyof typeof SPORT_LABELS>).map((sport) => (
              <button
                key={sport}
                onClick={() => updateSport(sport, !preferences.sports[sport])}
                disabled={!preferences.enabled}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  preferences.sports[sport]
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {SPORT_LABELS[sport]}
                {preferences.sports[sport] && (
                  <CheckCircle className="h-3.5 w-3.5 ml-2" />
                )}
              </button>
            ))}
          </div>
        </div>
        
        <Separator />
        
        {/* Alert Types */}
        <div className="space-y-3">
          <div>
            <Label className="text-base">Alert Types</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which events trigger Scout alerts
            </p>
          </div>
          
          <div className="space-y-3">
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border transition-all",
              preferences.alertTypes.scoringEvents ? "border-primary/30 bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <Trophy className={cn(
                  "h-4 w-4",
                  preferences.alertTypes.scoringEvents ? "text-primary" : "text-muted-foreground"
                )} />
                <div>
                  <p className="text-sm font-medium">Scoring Events</p>
                  <p className="text-xs text-muted-foreground">Alert on every score</p>
                </div>
              </div>
              <Switch 
                checked={preferences.alertTypes.scoringEvents} 
                onCheckedChange={(checked) => updateAlertType("scoringEvents", checked)}
                disabled={!preferences.enabled}
              />
            </div>
            
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border transition-all",
              preferences.alertTypes.periodSummaries ? "border-primary/30 bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <Activity className={cn(
                  "h-4 w-4",
                  preferences.alertTypes.periodSummaries ? "text-primary" : "text-muted-foreground"
                )} />
                <div>
                  <p className="text-sm font-medium">Period Summaries</p>
                  <p className="text-xs text-muted-foreground">End of quarters, innings, periods</p>
                </div>
              </div>
              <Switch 
                checked={preferences.alertTypes.periodSummaries} 
                onCheckedChange={(checked) => updateAlertType("periodSummaries", checked)}
                disabled={!preferences.enabled}
              />
            </div>
            
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border transition-all",
              preferences.alertTypes.dominantPerformance ? "border-primary/30 bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <TrendingUp className={cn(
                  "h-4 w-4",
                  preferences.alertTypes.dominantPerformance ? "text-primary" : "text-muted-foreground"
                )} />
                <div>
                  <p className="text-sm font-medium">Dominant Performance</p>
                  <p className="text-xs text-muted-foreground">No-hitters, scoring runs, milestones</p>
                </div>
              </div>
              <Switch 
                checked={preferences.alertTypes.dominantPerformance} 
                onCheckedChange={(checked) => updateAlertType("dominantPerformance", checked)}
                disabled={!preferences.enabled}
              />
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Delivery Channels */}
        <div className="space-y-3">
          <div>
            <Label className="text-base">Delivery Channels</Label>
            <p className="text-sm text-muted-foreground mt-1">
              How you receive Scout Live Watch alerts
            </p>
          </div>
          
          <div className="space-y-3">
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border transition-all",
              preferences.channels.push ? "border-primary/30 bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <Zap className={cn("h-4 w-4", preferences.channels.push ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium">Push Notifications</p>
                  <p className="text-xs text-muted-foreground">Real-time browser alerts</p>
                </div>
              </div>
              <Switch 
                checked={preferences.channels.push} 
                onCheckedChange={(checked) => updateChannel("push", checked)}
                disabled={!preferences.enabled}
              />
            </div>
            
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border transition-all",
              preferences.channels.inApp ? "border-primary/30 bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <Bell className={cn("h-4 w-4", preferences.channels.inApp ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium">In-App</p>
                  <p className="text-xs text-muted-foreground">Notification bell</p>
                </div>
              </div>
              <Switch 
                checked={preferences.channels.inApp} 
                onCheckedChange={(checked) => updateChannel("inApp", checked)}
                disabled={!preferences.enabled}
              />
            </div>
            
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border transition-all",
              preferences.channels.email ? "border-primary/30 bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <Mail className={cn("h-4 w-4", preferences.channels.email ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium">Email Digest</p>
                  <p className="text-xs text-muted-foreground">Summary of live events</p>
                </div>
              </div>
              <Switch 
                checked={preferences.channels.email} 
                onCheckedChange={(checked) => updateChannel("email", checked)}
                disabled={!preferences.enabled}
              />
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Rate Limiting */}
        <div className="space-y-3">
          <div>
            <Label className="text-base">Alert Frequency</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Control how many alerts you receive per hour
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {[
              { value: 0, label: "Unlimited" },
              { value: 10, label: "10/hour" },
              { value: 20, label: "20/hour" },
              { value: 30, label: "30/hour" },
              { value: 50, label: "50/hour" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  const newPrefs = { 
                    ...preferences, 
                    rateLimiting: { maxAlertsPerHour: option.value } 
                  };
                  setPreferences(newPrefs);
                  savePreferences(newPrefs);
                }}
                disabled={!preferences.enabled}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  preferences.rateLimiting.maxAlertsPerHour === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          
          {preferences.rateLimiting.maxAlertsPerHour > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 mt-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Once the hourly limit is reached, only critical alerts will come through until the next hour.
              </p>
            </div>
          )}
        </div>
        
        {/* Compliance Note */}
        <div className="flex items-start gap-2 p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">Informational Only</p>
            <p>
              Scout Live Watch provides neutral, analytical commentary. 
              No betting advice, predictions, or directives.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
