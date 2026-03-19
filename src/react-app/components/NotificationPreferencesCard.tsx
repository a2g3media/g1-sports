/**
 * Smart Notification Preferences Card
 * 
 * Comprehensive notification settings based on subscription tier with:
 * - Master toggle
 * - Mode selection (Smart Bundled / Every Event / Finals Only)
 * - Per-category toggles
 * - Per-sport toggles (based on favorites)
 * - Per-team overrides
 * - Quiet hours
 * - Pool reminders
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Button } from "@/react-app/components/ui/button";

import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { Input } from "@/react-app/components/ui/input";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { useFavoriteSports } from "@/react-app/components/FavoriteSportsSelector";
import { cn } from "@/react-app/lib/utils";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import {
  Bell, BellOff, Volume2, VolumeX, Zap, Trophy, Clock, Moon,
  TrendingUp, Activity, AlertTriangle, CloudRain, Calendar, Users,
  Loader2, Check, ChevronDown, ChevronRight, Crown, Lock, Info
} from "lucide-react";

// Types
type NotificationMode = "smart_bundled" | "every_event" | "finals_only";

interface NotificationSettings {
  mode: NotificationMode;
  masterEnabled: boolean;
  
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  
  finalScores: boolean;
  gameStarts: boolean;
  everyScore: boolean;
  majorMoments: boolean;
  periodSummaries: boolean;
  
  lineMovement: boolean;
  lineMovementThreshold: number;
  injuries: boolean;
  weather: boolean;
  
  pickLockReminders: boolean;
  scheduleChanges: boolean;
  poolActivity: boolean;
  weeklyRankRecap: boolean;
  
  customAlertRules: boolean;
  commandCenterAlerts: boolean;
  
  followedTeamsOnly: boolean;
  watchedGamesIncluded: boolean;
  poolGamesIncluded: boolean;
  
  sportOverrides: Record<string, { enabled?: boolean }>;
  teamOverrides: Record<string, { enabled?: boolean }>;
}

interface AvailableFeatures {
  canEnableEveryScore: boolean;
  canEnableProactiveAlerts: boolean;
  canEnableLineMovement: boolean;
  canEnableInjuries: boolean;
  canEnableWeather: boolean;
  canEnablePeriodSummaries: boolean;
  canEnableCustomAlerts: boolean;
  canEnableCommandCenter: boolean;
  canWatchGames: boolean;
}

const SPORT_NAMES: Record<string, string> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ncaaf: "College Football",
  ncaab: "College Basketball",
  soccer: "Soccer",
  tennis: "Tennis",
  golf: "Golf",
  mma: "MMA",
  boxing: "Boxing",
  f1: "F1",
};

function NotificationToggle({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  locked,
  badge,
}: {
  icon: typeof Bell;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
  badge?: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between py-3",
      disabled && "opacity-50"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          checked && !disabled ? "bg-primary/10" : "bg-muted"
        )}>
          <Icon className={cn(
            "h-4 w-4",
            checked && !disabled ? "text-primary" : "text-muted-foreground"
          )} />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{label}</Label>
            {badge && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            )}
            {locked && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 border-amber-500/50 text-amber-600">
                <Lock className="h-2.5 w-2.5" />
                Pro
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
        disabled={disabled || locked}
      />
    </div>
  );
}

function ModeCard({
  mode,
  label,
  description,
  icon: Icon,
  selected,
  onClick,
}: {
  mode: NotificationMode;
  label: string;
  description: string;
  icon: typeof Bell;
  selected: boolean;
  onClick: () => void;
}) {
  const colors = {
    smart_bundled: {
      icon: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
    every_event: {
      icon: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
    },
    finals_only: {
      icon: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left",
        "hover:border-primary/50 hover:bg-muted/50",
        selected ? "border-primary bg-primary/5" : "border-border"
      )}
    >
      {selected && (
        <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      <div className={cn(
        "h-9 w-9 rounded-lg flex items-center justify-center",
        selected ? colors[mode].bg : "bg-muted"
      )}>
        <Icon className={cn(
          "h-4 w-4",
          selected ? colors[mode].icon : "text-muted-foreground"
        )} />
      </div>
      <div>
        <p className={cn("text-sm font-medium", selected && "text-primary")}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function NotificationPreferencesCard() {
  const { user, isDemoMode } = useDemoAuth();
  const { subscription, loading: subLoading } = useSubscription();
  const { favoriteSports } = useFavoriteSports();
  
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [features, setFeatures] = useState<AvailableFeatures | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSportOverrides, setShowSportOverrides] = useState(false);
  const [showQuietHours, setShowQuietHours] = useState(false);
  
  // Load settings on mount
  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setIsLoading(false);
      return;
    }
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/notifications/settings");
        if (res.status === 401 || res.status === 403) return;
        if (res.ok) {
          const data = await res.json();
          setSettings(data.settings);
          setFeatures(data.availableFeatures);
        }
      } catch (error) {
        console.error("Failed to load notification settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [isDemoMode, user?.id]);
  
  const updateSettings = async (updates: Partial<NotificationSettings>) => {
    if (!settings) return;
    if (isDemoMode || !user?.id) return;
    
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    setIsSaving(true);
    
    try {
      const res = await fetch("/api/notifications/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      // Revert on error
      setSettings(settings);
    } finally {
      setIsSaving(false);
    }
  };
  
  const toggleSportOverride = (sport: string) => {
    if (!settings) return;
    
    const current = settings.sportOverrides[sport]?.enabled ?? true;
    const newOverrides = {
      ...settings.sportOverrides,
      [sport]: { enabled: !current },
    };
    
    updateSettings({ sportOverrides: newOverrides });
  };

  const previewWeeklyRankRecap = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission !== "granted") {
      const granted = await Notification.requestPermission();
      if (granted !== "granted") return;
    }

    const title = "🏆 Weekly Pool Recap";
    const body = "You climbed to 8th this week in March Madness Challenge. Keep it rolling!";
    const data = { url: "/pools", type: "weekly_results" };

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-72x72.png",
        tag: "preview-weekly-rank-recap",
        data,
      });
    } catch {
      new Notification(title, { body, icon: "/icons/icon-192x192.png" });
    }
  };
  
  if (isLoading || subLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  if (!settings || !features) {
    return null;
  }
  
  const tier = subscription?.tier || "free";
  const isPro = tier === "scout_pro" || tier === "scout_elite";
  const isElite = tier === "scout_elite";
  const hasPoolAccess = tier !== "free" && tier !== "anonymous";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Notification Preferences
              {isSaving && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              Smart defaults based on your sports and teams
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className={cn(
          "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
          settings.masterEnabled ? "border-primary bg-primary/5" : "border-border"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              settings.masterEnabled ? "bg-primary/10" : "bg-muted"
            )}>
              {settings.masterEnabled ? (
                <Volume2 className="h-5 w-5 text-primary" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium">Notifications Enabled</p>
              <p className="text-sm text-muted-foreground">
                {settings.masterEnabled ? "You're receiving alerts" : "All notifications paused"}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.masterEnabled}
            onCheckedChange={(checked) => updateSettings({ masterEnabled: checked })}
          />
        </div>
        
        {/* Mode Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Delivery Mode</Label>
            <Badge variant="outline" className="text-xs">Default: Smart Bundled</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ModeCard
              mode="smart_bundled"
              label="Smart Bundled"
              description="Groups by game, 60-90s windows"
              icon={Zap}
              selected={settings.mode === "smart_bundled"}
              onClick={() => updateSettings({ mode: "smart_bundled" })}
            />
            <ModeCard
              mode="every_event"
              label="Every Event"
              description="Instant delivery, no grouping"
              icon={Activity}
              selected={settings.mode === "every_event"}
              onClick={() => updateSettings({ mode: "every_event" })}
            />
            <ModeCard
              mode="finals_only"
              label="Finals Only"
              description="Just game-ending alerts"
              icon={Trophy}
              selected={settings.mode === "finals_only"}
              onClick={() => updateSettings({ mode: "finals_only" })}
            />
          </div>
        </div>
        
        <Separator />
        
        {/* Score Alerts */}
        <div className="space-y-1">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
            Score Alerts
          </h4>
          
          <NotificationToggle
            icon={Trophy}
            label="Final Scores"
            description="Game-ending scores for followed teams"
            checked={settings.finalScores}
            onCheckedChange={(checked) => updateSettings({ finalScores: checked })}
          />
          
          <NotificationToggle
            icon={Bell}
            label="Game Starts"
            description="When your followed team's game begins"
            checked={settings.gameStarts}
            onCheckedChange={(checked) => updateSettings({ gameStarts: checked })}
          />
          
          <NotificationToggle
            icon={Activity}
            label="Every Score"
            description="All scoring plays (TDs, goals, runs, baskets)"
            checked={settings.everyScore}
            onCheckedChange={(checked) => updateSettings({ everyScore: checked })}
            locked={!features.canEnableEveryScore}
            badge={features.canEnableEveryScore ? undefined : "Pro"}
          />
          
          <NotificationToggle
            icon={Zap}
            label="Major Moments"
            description="Touchdowns, home runs, goals (capped per game)"
            checked={settings.majorMoments}
            onCheckedChange={(checked) => updateSettings({ majorMoments: checked })}
          />
          
          <NotificationToggle
            icon={Clock}
            label="Period Summaries"
            description="Quarter, half, and period break recaps"
            checked={settings.periodSummaries}
            onCheckedChange={(checked) => updateSettings({ periodSummaries: checked })}
            locked={!features.canEnablePeriodSummaries}
            badge={features.canEnablePeriodSummaries ? undefined : "Pro"}
          />
        </div>
        
        <Separator />
        
        {/* Proactive Alerts */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Proactive Alerts
            </h4>
            {!isPro && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 border-amber-500/50 text-amber-600">
                <Crown className="h-2.5 w-2.5" />
                Pro Feature
              </Badge>
            )}
          </div>
          
          <NotificationToggle
            icon={TrendingUp}
            label="Line Movement"
            description={`Alert when lines move ${settings.lineMovementThreshold}+ points`}
            checked={settings.lineMovement}
            onCheckedChange={(checked) => updateSettings({ lineMovement: checked })}
            locked={!features.canEnableLineMovement}
          />
          
          <NotificationToggle
            icon={AlertTriangle}
            label="Injury Updates"
            description="Confirmed impact injuries for key players"
            checked={settings.injuries}
            onCheckedChange={(checked) => updateSettings({ injuries: checked })}
            locked={!features.canEnableInjuries}
          />
          
          <NotificationToggle
            icon={CloudRain}
            label="Weather Alerts"
            description="Significant weather for outdoor games"
            checked={settings.weather}
            onCheckedChange={(checked) => updateSettings({ weather: checked })}
            locked={!features.canEnableWeather}
          />
        </div>
        
        {/* Pool Reminders */}
        {hasPoolAccess && (
          <>
            <Separator />
            <div className="space-y-1">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Pool Reminders
              </h4>
              
              <NotificationToggle
                icon={Calendar}
                label="Pick Lock Reminders"
                description="Reminder before pick deadlines"
                checked={settings.pickLockReminders}
                onCheckedChange={(checked) => updateSettings({ pickLockReminders: checked })}
              />
              
              <NotificationToggle
                icon={Clock}
                label="Schedule Changes"
                description="Game time changes for pool games"
                checked={settings.scheduleChanges}
                onCheckedChange={(checked) => updateSettings({ scheduleChanges: checked })}
              />
              
              <NotificationToggle
                icon={Users}
                label="Pool Activity"
                description="When others make picks in your pools"
                checked={settings.poolActivity}
                onCheckedChange={(checked) => updateSettings({ poolActivity: checked })}
              />

              <NotificationToggle
                icon={Trophy}
                label="Weekly Rank Recap"
                description="Celebratory weekly rank updates (up, down, winner callouts)"
                checked={settings.weeklyRankRecap}
                onCheckedChange={(checked) => updateSettings({ weeklyRankRecap: checked })}
              />
              <div className="pl-12 pt-1">
                <Button variant="outline" size="sm" onClick={previewWeeklyRankRecap}>
                  Preview Weekly Recap Notification
                </Button>
              </div>
            </div>
          </>
        )}
        
        {/* Elite Features */}
        {isElite && (
          <>
            <Separator />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  Elite Features
                </h4>
                <Badge className="text-[10px] px-1.5 py-0 gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                  <Crown className="h-2.5 w-2.5" />
                  Elite
                </Badge>
              </div>
              
              <NotificationToggle
                icon={Zap}
                label="Custom Alert Rules"
                description="Alerts from your custom rule configurations"
                checked={settings.customAlertRules}
                onCheckedChange={(checked) => updateSettings({ customAlertRules: checked })}
              />
              
              <NotificationToggle
                icon={Activity}
                label="Command Center Alerts"
                description="Multi-game watch alerts"
                checked={settings.commandCenterAlerts}
                onCheckedChange={(checked) => updateSettings({ commandCenterAlerts: checked })}
              />
            </div>
          </>
        )}
        
        <Separator />
        
        {/* Sport Overrides */}
        <div className="space-y-3">
          <button
            onClick={() => setShowSportOverrides(!showSportOverrides)}
            className="flex items-center justify-between w-full text-left"
          >
            <div>
              <h4 className="font-medium text-sm">Per-Sport Settings</h4>
              <p className="text-xs text-muted-foreground">
                Enable/disable alerts by sport
              </p>
            </div>
            {showSportOverrides ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          {showSportOverrides && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
              {favoriteSports.length > 0 ? (
                favoriteSports.map((sport) => {
                  const isEnabled = settings.sportOverrides[sport]?.enabled ?? true;
                  return (
                    <button
                      key={sport}
                      onClick={() => toggleSportOverride(sport)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm",
                        isEnabled
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-muted/50 text-muted-foreground"
                      )}
                    >
                      {isEnabled ? (
                        <Bell className="h-3.5 w-3.5" />
                      ) : (
                        <BellOff className="h-3.5 w-3.5" />
                      )}
                      {SPORT_NAMES[sport] || sport.toUpperCase()}
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground col-span-full">
                  No favorite sports selected. Add some in Favorite Sports above.
                </p>
              )}
            </div>
          )}
        </div>
        
        {/* Quiet Hours */}
        <div className="space-y-3">
          <button
            onClick={() => setShowQuietHours(!showQuietHours)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                settings.quietHoursEnabled ? "bg-primary/10" : "bg-muted"
              )}>
                <Moon className={cn(
                  "h-4 w-4",
                  settings.quietHoursEnabled ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <h4 className="font-medium text-sm">Quiet Hours</h4>
                <p className="text-xs text-muted-foreground">
                  {settings.quietHoursEnabled
                    ? `${settings.quietHoursStart} - ${settings.quietHoursEnd}`
                    : "Not enabled"}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.quietHoursEnabled}
              onCheckedChange={(checked) => updateSettings({ quietHoursEnabled: checked })}
              onClick={(e) => e.stopPropagation()}
            />
          </button>
          
          {showQuietHours && settings.quietHoursEnabled && (
            <div className="flex items-center gap-4 pl-12">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Start</Label>
                <Input
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) => updateSettings({ quietHoursStart: e.target.value })}
                  className="w-28"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">End</Label>
                <Input
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) => updateSettings({ quietHoursEnd: e.target.value })}
                  className="w-28"
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Info box */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>Smart Bundled</strong> groups related alerts from the same game 
              into single notifications, reducing noise while keeping you informed.
            </p>
            <p>
              Critical alerts (game winners, overtime, major injuries) always 
              bypass bundling and deliver immediately.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default NotificationPreferencesCard;
