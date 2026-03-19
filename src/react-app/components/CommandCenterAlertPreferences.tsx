import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Switch } from "@/react-app/components/ui/switch";
import { Badge } from "@/react-app/components/ui/badge";
import { Separator } from "@/react-app/components/ui/separator";
import { cn } from "@/react-app/lib/utils";
import { 
  Bell, TrendingUp, AlertTriangle, Activity, 
  Target, Clock, Zap, Loader2, Check, Trophy
} from "lucide-react";

// Alert category configuration
const ALERT_CATEGORIES = [
  {
    key: "line_movement",
    label: "Line Movement",
    description: "Spread, total, and moneyline changes",
    icon: TrendingUp,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    key: "injury",
    label: "Injury Updates",
    description: "Player injuries and status changes",
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    key: "game_state",
    label: "Game State",
    description: "Scoring runs, momentum swings, close games",
    icon: Activity,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "props",
    label: "Prop Tracking",
    description: "Player prop progress and hits",
    icon: Target,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    key: "schedule",
    label: "Schedule",
    description: "Game start times and delays",
    icon: Clock,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  {
    key: "betting_edge",
    label: "Betting Edge",
    description: "Sharp action and value opportunities",
    icon: Zap,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    badge: "Pro",
  },
] as const;

type CategoryKey = typeof ALERT_CATEGORIES[number]["key"];

interface CommandCenterPreferences {
  is_enabled: boolean;
  categories: Record<CategoryKey, boolean>;
  threshold_line_movement: number;
  threshold_score_run: number;
}

const DEFAULT_PREFERENCES: CommandCenterPreferences = {
  is_enabled: true,
  categories: {
    line_movement: true,
    injury: true,
    game_state: true,
    props: true,
    schedule: true,
    betting_edge: false,
  },
  threshold_line_movement: 0.5,
  threshold_score_run: 10,
};

export function CommandCenterAlertPreferences() {
  const [preferences, setPreferences] = useState<CommandCenterPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const res = await fetch("/api/command-center/alert-preferences", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setPreferences(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error("Failed to load command center preferences:", err);
      } finally {
        setLoading(false);
      }
    };
    loadPreferences();
  }, []);

  // Save preferences
  const savePreferences = useCallback(async (newPrefs: CommandCenterPreferences) => {
    setSaving(true);
    try {
      await fetch("/api/command-center/alert-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newPrefs),
      });
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  const updatePreference = <K extends keyof CommandCenterPreferences>(
    key: K,
    value: CommandCenterPreferences[K]
  ) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    savePreferences(newPrefs);
  };

  const toggleCategory = (category: CategoryKey, enabled: boolean) => {
    const newCategories = { ...preferences.categories, [category]: enabled };
    const newPrefs = { ...preferences, categories: newCategories };
    setPreferences(newPrefs);
    savePreferences(newPrefs);
  };

  const enabledCount = Object.values(preferences.categories).filter(Boolean).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
            <Bell className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Command Center Alerts
              {saving && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Choose which alert types appear in your Command Center
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className={cn(
          "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
          preferences.is_enabled 
            ? "border-primary bg-primary/5" 
            : "border-border"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              preferences.is_enabled ? "bg-primary/10" : "bg-muted"
            )}>
              <Trophy className={cn(
                "h-5 w-5",
                preferences.is_enabled ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className="font-medium">Command Center Alerts</p>
              <p className="text-sm text-muted-foreground">
                {preferences.is_enabled 
                  ? `${enabledCount} categories enabled` 
                  : "All alerts paused"}
              </p>
            </div>
          </div>
          <Switch 
            checked={preferences.is_enabled} 
            onCheckedChange={(checked) => updatePreference("is_enabled", checked)}
          />
        </div>

        {/* Category Toggles */}
        {preferences.is_enabled && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Alert Categories</Label>
                <button
                  onClick={() => {
                    const allEnabled = enabledCount === ALERT_CATEGORIES.length;
                    const newCategories = ALERT_CATEGORIES.reduce((acc, cat) => {
                      acc[cat.key] = !allEnabled;
                      return acc;
                    }, {} as Record<CategoryKey, boolean>);
                    const newPrefs = { ...preferences, categories: newCategories };
                    setPreferences(newPrefs);
                    savePreferences(newPrefs);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  {enabledCount === ALERT_CATEGORIES.length ? "Disable All" : "Enable All"}
                </button>
              </div>
              
              <div className="grid gap-2">
                {ALERT_CATEGORIES.map((category) => {
                  const isEnabled = preferences.categories[category.key];
                  const Icon = category.icon;
                  
                  return (
                    <div
                      key={category.key}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-all",
                        isEnabled 
                          ? "border-primary/30 bg-primary/5" 
                          : "border-border hover:border-border/80"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-9 w-9 rounded-lg flex items-center justify-center",
                          isEnabled ? category.bgColor : "bg-muted"
                        )}>
                          <Icon className={cn(
                            "h-4 w-4",
                            isEnabled ? category.color : "text-muted-foreground"
                          )} />
                        </div>
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2">
                            {category.label}
                            {'badge' in category && category.badge && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {category.badge}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {category.description}
                          </p>
                        </div>
                      </div>
                      <Switch 
                        checked={isEnabled} 
                        onCheckedChange={(checked) => toggleCategory(category.key, checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Thresholds */}
            <div className="space-y-4">
              <Label className="text-base">Alert Thresholds</Label>
              <p className="text-sm text-muted-foreground">
                Fine-tune when alerts trigger
              </p>

              {/* Line Movement Threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Line Movement</Label>
                  <span className="text-sm font-medium text-primary">
                    {preferences.threshold_line_movement} points
                  </span>
                </div>
                <div className="flex gap-2">
                  {[0.5, 1, 1.5, 2].map((value) => (
                    <button
                      key={value}
                      onClick={() => updatePreference("threshold_line_movement", value)}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                        preferences.threshold_line_movement === value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      )}
                    >
                      {value === 0.5 ? "½" : value}pt
                      {preferences.threshold_line_movement === value && (
                        <Check className="h-3 w-3 ml-1 inline" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Alert when lines move by this amount or more
                </p>
              </div>

              {/* Score Run Threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Scoring Run</Label>
                  <span className="text-sm font-medium text-primary">
                    {preferences.threshold_score_run}-0 runs
                  </span>
                </div>
                <div className="flex gap-2">
                  {[8, 10, 12, 15].map((value) => (
                    <button
                      key={value}
                      onClick={() => updatePreference("threshold_score_run", value)}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                        preferences.threshold_score_run === value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      )}
                    >
                      {value}-0
                      {preferences.threshold_score_run === value && (
                        <Check className="h-3 w-3 ml-1 inline" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Alert on unanswered scoring runs of this size
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
