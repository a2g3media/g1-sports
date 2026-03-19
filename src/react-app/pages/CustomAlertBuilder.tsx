import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSubscription } from "@/react-app/hooks/useSubscription";
import { Button } from "@/react-app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Switch } from "@/react-app/components/ui/switch";
import { Slider } from "@/react-app/components/ui/slider";
import { Badge } from "@/react-app/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Crown,
  Flame,
  Lock,
  Plus,
  Shield,
  Smartphone,
  Target,
  Trash2,
  Zap,
  Clock,
  Users,
  Star,
  Activity,
  AlertTriangle,
  Cloud,
  TrendingUp,
} from "lucide-react";

// Types matching backend
interface TriggerType {
  key: string;
  label: string;
  description: string;
  sports: string[];
  configSchema: Record<string, {
    type: string;
    default: unknown;
    label: string;
    min?: number;
    max?: number;
    step?: number;
  }>;
}

interface DominantPreset {
  key: string;
  label: string;
  description: string;
}

interface AlertRule {
  id?: number;
  name: string;
  scope_type: "ALL" | "SPORT" | "LEAGUE" | "TEAM" | "WATCHLIST";
  scope_ids: string[];
  scope_sports: string[];
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  threshold_value: number | null;
  time_window_minutes: number | null;
  is_bundled: boolean;
  max_per_game_per_hour: number;
  push_enabled: boolean;
  in_app_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  is_active: boolean;
}

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "SOCCER", "NCAAF", "NCAAB"];
const SCOPE_TYPES = [
  { key: "ALL", label: "All Games", icon: Activity, description: "Monitor every game" },
  { key: "SPORT", label: "By Sport", icon: Target, description: "Choose specific sports" },
  { key: "TEAM", label: "My Teams", icon: Shield, description: "Teams you follow" },
  { key: "WATCHLIST", label: "Watchlist", icon: Star, description: "Your saved games" },
];

const TRIGGER_ICONS: Record<string, typeof Bell> = {
  SCORE_EVENT: Zap,
  PERIOD_BREAK: Clock,
  FINAL_SCORE: Check,
  LINE_MOVEMENT: TrendingUp,
  INJURY: AlertTriangle,
  WEATHER: Cloud,
  DOMINANT_PERFORMANCE: Flame,
};

// Elite locked preview component
function EliteLockedPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-4">
            <Crown className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Custom Alert Builder</h1>
          <p className="text-muted-foreground text-lg">Elite Feature</p>
        </div>

        {/* Blurred preview */}
        <div className="relative">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <Card className="border-amber-500/50 bg-card/95">
              <CardContent className="p-6 text-center">
                <Lock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Unlock Custom Alerts</h2>
                <p className="text-muted-foreground mb-4 max-w-md">
                  Build personalized alert rules with sport-specific triggers, custom thresholds, 
                  and intelligent delivery preferences.
                </p>
                <ul className="text-left text-sm space-y-2 mb-6 max-w-xs mx-auto">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Sport-aware trigger types
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Dominant performance detection
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Custom bundling & quiet hours
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Test before activating
                  </li>
                </ul>
                <Button
                  onClick={() => navigate("/settings?tab=subscription")}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Elite
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Preview content */}
          <div className="space-y-4 opacity-50 pointer-events-none">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-sm font-bold text-violet-400">1</span>
                  Select Scope
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {SCOPE_TYPES.map((scope) => (
                    <div key={scope.key} className="p-4 rounded-lg border border-border/50 text-center">
                      <scope.icon className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                      <div className="font-medium text-sm">{scope.label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-sm font-bold text-violet-400">2</span>
                  Choose Trigger
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {["SCORE_EVENT", "FINAL_SCORE", "LINE_MOVEMENT", "INJURY", "WEATHER", "DOMINANT_PERFORMANCE"].map((key) => (
                    <div key={key} className="p-4 rounded-lg border border-border/50">
                      <div className="w-8 h-8 rounded-lg bg-muted mb-2" />
                      <div className="h-4 bg-muted rounded w-3/4" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step indicator
function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const steps = ["Scope", "Trigger", "Conditions", "Delivery"];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              index + 1 === currentStep
                ? "bg-violet-600 text-white"
                : index + 1 < currentStep
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {index + 1 < currentStep ? <Check className="w-4 h-4" /> : index + 1}
          </div>
          <span className={`ml-2 text-sm hidden sm:inline ${index + 1 === currentStep ? "font-medium" : "text-muted-foreground"}`}>
            {step}
          </span>
          {index < totalSteps - 1 && <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

// Step 1: Scope Selection
function ScopeStep({
  rule,
  onUpdate,
}: {
  rule: AlertRule;
  onUpdate: (updates: Partial<AlertRule>) => void;
}) {
  const [selectedSports, setSelectedSports] = useState<string[]>(rule.scope_sports);

  const handleScopeType = (type: AlertRule["scope_type"]) => {
    onUpdate({ scope_type: type, scope_ids: [], scope_sports: type === "SPORT" ? selectedSports : [] });
  };

  const toggleSport = (sport: string) => {
    const newSports = selectedSports.includes(sport)
      ? selectedSports.filter((s) => s !== sport)
      : [...selectedSports, sport];
    setSelectedSports(newSports);
    onUpdate({ scope_sports: newSports });
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-medium mb-3 block">What do you want to monitor?</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SCOPE_TYPES.map((scope) => {
            const isSelected = rule.scope_type === scope.key;
            return (
              <button
                key={scope.key}
                onClick={() => handleScopeType(scope.key as AlertRule["scope_type"])}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-border hover:border-violet-500/50"
                }`}
              >
                <scope.icon className={`w-6 h-6 mb-2 ${isSelected ? "text-violet-500" : "text-muted-foreground"}`} />
                <div className="font-medium">{scope.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{scope.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {rule.scope_type === "SPORT" && (
        <div className="animate-in fade-in slide-in-from-top-2">
          <Label className="text-base font-medium mb-3 block">Select sports</Label>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((sport) => {
              const isSelected = selectedSports.includes(sport);
              return (
                <button
                  key={sport}
                  onClick={() => toggleSport(sport)}
                  className={`px-4 py-2 rounded-full border-2 font-medium transition-all ${
                    isSelected
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-border hover:border-violet-500/50"
                  }`}
                >
                  {sport}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {rule.scope_type === "TEAM" && (
        <div className="animate-in fade-in slide-in-from-top-2">
          <Label className="text-base font-medium mb-3 block">Select your teams</Label>
          <div className="p-4 rounded-lg bg-muted/50 border border-dashed border-border text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Teams from your watchlist will appear here</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Step 2: Trigger Selection
function TriggerStep({
  rule,
  triggerTypes,
  dominantPresets,
  onUpdate,
}: {
  rule: AlertRule;
  triggerTypes: TriggerType[];
  dominantPresets: DominantPreset[];
  onUpdate: (updates: Partial<AlertRule>) => void;
}) {
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);

  // Filter triggers by selected sports
  const availableTriggers = triggerTypes.filter((t) => {
    if (rule.scope_type === "SPORT" && rule.scope_sports.length > 0) {
      return t.sports.some((s) => rule.scope_sports.includes(s));
    }
    return true;
  });

  const handleTriggerSelect = (triggerKey: string) => {
    onUpdate({ trigger_type: triggerKey, trigger_config: {} });
    if (triggerKey !== "DOMINANT_PERFORMANCE") {
      setSelectedPresets([]);
    }
  };

  const togglePreset = (presetKey: string) => {
    const newPresets = selectedPresets.includes(presetKey)
      ? selectedPresets.filter((p) => p !== presetKey)
      : [...selectedPresets, presetKey];
    setSelectedPresets(newPresets);
    onUpdate({ trigger_config: { ...rule.trigger_config, presets: newPresets } });
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-medium mb-3 block">What should trigger the alert?</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {availableTriggers.map((trigger) => {
            const isSelected = rule.trigger_type === trigger.key;
            const Icon = TRIGGER_ICONS[trigger.key] || Bell;
            return (
              <button
                key={trigger.key}
                onClick={() => handleTriggerSelect(trigger.key)}
                className={`p-4 rounded-xl border-2 transition-all text-left flex items-start gap-3 ${
                  isSelected
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-border hover:border-violet-500/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isSelected ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{trigger.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{trigger.description}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {trigger.sports.slice(0, 4).map((sport) => (
                      <Badge key={sport} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {sport}
                      </Badge>
                    ))}
                    {trigger.sports.length > 4 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        +{trigger.sports.length - 4}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {rule.trigger_type === "DOMINANT_PERFORMANCE" && dominantPresets.length > 0 && (
        <div className="animate-in fade-in slide-in-from-top-2">
          <Label className="text-base font-medium mb-3 block">Select performance types</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {dominantPresets.map((preset) => {
              const isSelected = selectedPresets.includes(preset.key);
              return (
                <button
                  key={preset.key}
                  onClick={() => togglePreset(preset.key)}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    isSelected
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-border hover:border-amber-500/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Flame className={`w-4 h-4 ${isSelected ? "text-amber-500" : "text-muted-foreground"}`} />
                    <span className="font-medium text-sm">{preset.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 pl-6">{preset.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Step 3: Conditions
function ConditionsStep({
  rule,
  triggerTypes,
  onUpdate,
}: {
  rule: AlertRule;
  triggerTypes: TriggerType[];
  onUpdate: (updates: Partial<AlertRule>) => void;
}) {
  const currentTrigger = triggerTypes.find((t) => t.key === rule.trigger_type);
  const configSchema = currentTrigger?.configSchema || {};

  return (
    <div className="space-y-6">
      {/* Trigger-specific config */}
      {Object.entries(configSchema).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trigger Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(configSchema).map(([key, config]) => {
              if (config.type === "boolean") {
                return (
                  <div key={key} className="flex items-center justify-between">
                    <Label>{config.label}</Label>
                    <Switch
                      checked={(rule.trigger_config[key] as boolean) ?? config.default}
                      onCheckedChange={(checked) =>
                        onUpdate({ trigger_config: { ...rule.trigger_config, [key]: checked } })
                      }
                    />
                  </div>
                );
              }
              if (config.type === "number") {
                const value = (rule.trigger_config[key] as number) ?? config.default;
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{config.label}</Label>
                      <span className="text-sm font-medium text-violet-500">{value}</span>
                    </div>
                    <Slider
                      value={[value as number]}
                      min={config.min}
                      max={config.max}
                      step={config.step}
                      onValueChange={([v]) =>
                        onUpdate({ trigger_config: { ...rule.trigger_config, [key]: v } })
                      }
                    />
                  </div>
                );
              }
              return null;
            })}
          </CardContent>
        </Card>
      )}

      {/* Bundling & Rate Limiting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Delivery Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Bundle related alerts</Label>
              <p className="text-xs text-muted-foreground">Combine alerts from same game in 60-90s window</p>
            </div>
            <Switch
              checked={rule.is_bundled}
              onCheckedChange={(checked) => onUpdate({ is_bundled: checked })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Max alerts per game per hour</Label>
              <span className="text-sm font-medium text-violet-500">{rule.max_per_game_per_hour}</span>
            </div>
            <Slider
              value={[rule.max_per_game_per_hour]}
              min={1}
              max={10}
              step={1}
              onValueChange={([v]) => onUpdate({ max_per_game_per_hour: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Quiet Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Start</Label>
              <Input
                type="time"
                value={rule.quiet_hours_start || ""}
                onChange={(e) => onUpdate({ quiet_hours_start: e.target.value || null })}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">End</Label>
              <Input
                type="time"
                value={rule.quiet_hours_end || ""}
                onChange={(e) => onUpdate({ quiet_hours_end: e.target.value || null })}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Alerts during quiet hours will be queued and delivered after
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Step 4: Delivery & Review
function DeliveryStep({
  rule,
  onUpdate,
  onTest,
  isTesting,
}: {
  rule: AlertRule;
  onUpdate: (updates: Partial<AlertRule>) => void;
  onTest: () => void;
  isTesting: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Rule Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Name Your Rule</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="e.g., NFL Red Zone Alerts"
            value={rule.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="text-lg"
          />
        </CardContent>
      </Card>

      {/* Delivery Methods */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Delivery Methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <div className="font-medium">Push Notifications</div>
                <div className="text-xs text-muted-foreground">Instant alerts to your device</div>
              </div>
            </div>
            <Switch
              checked={rule.push_enabled}
              onCheckedChange={(checked) => onUpdate({ push_enabled: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Bell className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <div className="font-medium">In-App Alerts</div>
                <div className="text-xs text-muted-foreground">Badge and alert center updates</div>
              </div>
            </div>
            <Switch
              checked={rule.in_app_enabled}
              onCheckedChange={(checked) => onUpdate({ in_app_enabled: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Review Summary */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="w-4 h-4 text-violet-500" />
            Rule Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Scope</span>
            <span className="font-medium">
              {rule.scope_type === "ALL" && "All Games"}
              {rule.scope_type === "SPORT" && rule.scope_sports.join(", ")}
              {rule.scope_type === "TEAM" && "My Teams"}
              {rule.scope_type === "WATCHLIST" && "Watchlist"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Trigger</span>
            <span className="font-medium">{rule.trigger_type.replace(/_/g, " ")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bundled</span>
            <span className="font-medium">{rule.is_bundled ? "Yes" : "No"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max/Hour</span>
            <span className="font-medium">{rule.max_per_game_per_hour}</span>
          </div>
        </CardContent>
      </Card>

      {/* Test Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={onTest}
        disabled={isTesting || !rule.name}
      >
        {isTesting ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
            Testing...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 mr-2" />
            Test This Rule
          </>
        )}
      </Button>
    </div>
  );
}

// Rules List View
function RulesListView({
  rules,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
  onCreate,
}: {
  rules: AlertRule[];
  onEdit: (rule: AlertRule) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Your Alert Rules</h2>
          <p className="text-sm text-muted-foreground">{rules.length} custom rules</p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          New Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No custom rules yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first alert rule to get personalized notifications
            </p>
            <Button onClick={onCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const Icon = TRIGGER_ICONS[rule.trigger_type] || Bell;
            return (
              <Card key={rule.id} className={rule.is_active ? "" : "opacity-60"}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      rule.is_active ? "bg-violet-500/20" : "bg-muted"
                    }`}>
                      <Icon className={`w-6 h-6 ${rule.is_active ? "text-violet-500" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{rule.name}</h3>
                        <Badge variant={rule.is_active ? "default" : "secondary"} className="text-xs">
                          {rule.is_active ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{rule.trigger_type.replace(/_/g, " ")}</span>
                        <span>•</span>
                        <span>
                          {rule.scope_type === "ALL" && "All Games"}
                          {rule.scope_type === "SPORT" && rule.scope_sports.join(", ")}
                          {rule.scope_type === "TEAM" && "My Teams"}
                          {rule.scope_type === "WATCHLIST" && "Watchlist"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => rule.id && onToggle(rule.id)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => onEdit(rule)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => rule.id && onDuplicate(rule.id)}>
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => rule.id && onDelete(rule.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Main component
export function CustomAlertBuilder() {
  const { features, loading } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [view, setView] = useState<"list" | "wizard">("list");
  const [step, setStep] = useState(1);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [triggerTypes, setTriggerTypes] = useState<TriggerType[]>([]);
  const [dominantPresets, setDominantPresets] = useState<DominantPreset[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [rule, setRule] = useState<AlertRule>({
    name: "",
    scope_type: "ALL",
    scope_ids: [],
    scope_sports: [],
    trigger_type: "SCORE_EVENT",
    trigger_config: {},
    threshold_value: null,
    time_window_minutes: null,
    is_bundled: true,
    max_per_game_per_hour: 3,
    push_enabled: true,
    in_app_enabled: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
    is_active: true,
  });

  // Check if should start in wizard mode
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setView("wizard");
    }
  }, [searchParams]);

  // Fetch config and rules
  useEffect(() => {
    if (!features?.hasCustomAlerts) return;

    // Fetch trigger types config
    fetch("/api/alert-rules/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.triggerTypes) setTriggerTypes(data.triggerTypes);
        if (data.dominantPresets) setDominantPresets(data.dominantPresets);
      })
      .catch(console.error);

    // Fetch user's rules
    fetch("/api/alert-rules")
      .then((res) => res.json())
      .then((data) => {
        if (data.rules) setRules(data.rules);
      })
      .catch(console.error);
  }, [features?.hasCustomAlerts]);

  // Update dominant presets when sport scope changes
  useEffect(() => {
    if (rule.scope_type === "SPORT" && rule.scope_sports.length > 0) {
      const sport = rule.scope_sports[0];
      fetch(`/api/alert-rules/config?sport=${sport}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.dominantPresets) setDominantPresets(data.dominantPresets);
        })
        .catch(console.error);
    }
  }, [rule.scope_type, rule.scope_sports]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!features?.hasCustomAlerts) {
    return <EliteLockedPreview />;
  }

  const updateRule = (updates: Partial<AlertRule>) => {
    setRule((prev) => ({ ...prev, ...updates }));
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await fetch("/api/alert-rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_type: rule.trigger_type,
          trigger_config: rule.trigger_config,
          scope_sports: rule.scope_sports,
        }),
      });
      const data = await res.json();
      if (data.wouldTrigger) {
        alert(`✓ Rule would trigger!\n\n${data.alertPreview?.headline}\n${data.alertPreview?.body}`);
      } else {
        alert(`Rule would not trigger with current conditions.\n\n${data.notes || ""}`);
      }
    } catch (error) {
      console.error("Test failed:", error);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      const method = editingRule?.id ? "PATCH" : "POST";
      const url = editingRule?.id ? `/api/alert-rules/${editingRule.id}` : "/api/alert-rules";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });

      if (res.ok) {
        const data = await res.json();
        if (editingRule?.id) {
          setRules((prev) => prev.map((r) => (r.id === editingRule.id ? data.rule : r)));
        } else {
          setRules((prev) => [...prev, data.rule]);
        }
        setView("list");
        setStep(1);
        setEditingRule(null);
        resetRule();
      }
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const handleEdit = (ruleToEdit: AlertRule) => {
    setEditingRule(ruleToEdit);
    setRule(ruleToEdit);
    setView("wizard");
    setStep(1);
  };

  const handleDuplicate = async (id: number) => {
    try {
      const res = await fetch(`/api/alert-rules/${id}/duplicate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRules((prev) => [...prev, data.rule]);
      }
    } catch (error) {
      console.error("Duplicate failed:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    try {
      const res = await fetch(`/api/alert-rules/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const res = await fetch(`/api/alert-rules/${id}/toggle`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRules((prev) => prev.map((r) => (r.id === id ? data.rule : r)));
      }
    } catch (error) {
      console.error("Toggle failed:", error);
    }
  };

  const resetRule = () => {
    setRule({
      name: "",
      scope_type: "ALL",
      scope_ids: [],
      scope_sports: [],
      trigger_type: "SCORE_EVENT",
      trigger_config: {},
      threshold_value: null,
      time_window_minutes: null,
      is_bundled: true,
      max_per_game_per_hour: 3,
      push_enabled: true,
      in_app_enabled: true,
      quiet_hours_start: null,
      quiet_hours_end: null,
      is_active: true,
    });
  };

  const startNewRule = () => {
    resetRule();
    setEditingRule(null);
    setStep(1);
    setView("wizard");
  };

  if (view === "list") {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate("/alerts")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Alerts
            </Button>
            <Badge className="bg-gradient-to-r from-amber-500 to-orange-600">
              <Crown className="w-3 h-3 mr-1" />
              Elite
            </Badge>
          </div>

          <RulesListView
            rules={rules}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onCreate={startNewRule}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step > 1) {
                setStep(step - 1);
              } else {
                setView("list");
                setEditingRule(null);
                resetRule();
              }
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step > 1 ? "Back" : "Cancel"}
          </Button>
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-600">
            <Crown className="w-3 h-3 mr-1" />
            Elite
          </Badge>
        </div>

        <h1 className="text-2xl font-bold text-center mb-2">
          {editingRule ? "Edit Alert Rule" : "Create Alert Rule"}
        </h1>
        <StepIndicator currentStep={step} totalSteps={4} />

        {/* Step Content */}
        <div className="mb-8">
          {step === 1 && <ScopeStep rule={rule} onUpdate={updateRule} />}
          {step === 2 && (
            <TriggerStep
              rule={rule}
              triggerTypes={triggerTypes}
              dominantPresets={dominantPresets}
              onUpdate={updateRule}
            />
          )}
          {step === 3 && (
            <ConditionsStep rule={rule} triggerTypes={triggerTypes} onUpdate={updateRule} />
          )}
          {step === 4 && (
            <DeliveryStep rule={rule} onUpdate={updateRule} onTest={handleTest} isTesting={isTesting} />
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step < 4 ? (
            <Button
              className="flex-1"
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && !rule.trigger_type}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
              onClick={handleSave}
              disabled={!rule.name || (!rule.push_enabled && !rule.in_app_enabled)}
            >
              <Check className="w-4 h-4 mr-2" />
              {editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
