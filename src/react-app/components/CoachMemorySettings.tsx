import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Label } from "@/react-app/components/ui/label";
import { Button } from "@/react-app/components/ui/button";
import { Switch } from "@/react-app/components/ui/switch";
import { Separator } from "@/react-app/components/ui/separator";
import { Badge } from "@/react-app/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/react-app/components/ui/alert-dialog";
import { cn } from "@/react-app/lib/utils";
import {
  Brain,
  Users,
  User,
  Trophy,
  Star,
  X,
  Trash2,
  RefreshCw,
  Check,
  Loader2,
  MessageSquare,
  TrendingUp,
  CloudRain,
  Activity,
  Target,
  Zap,
  History,
  Settings,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

// Types matching the backend
interface FollowedEntity {
  id: number;
  entityType: "TEAM" | "PLAYER" | "LEAGUE" | "GAME";
  entityKey: string;
  entityName: string;
  sportKey: string;
  priority: number;
  context: string | null;
  autoAdded: boolean;
  isActive: boolean;
  createdAt: string;
}

interface MemoryPreferences {
  tone: "casual" | "balanced" | "analytical";
  detailLevel: "brief" | "medium" | "detailed";
  focusInjuries: boolean;
  focusWeather: boolean;
  focusTrends: boolean;
  focusLineMovement: boolean;
  focusMatchups: boolean;
  includeHistoricalContext: boolean;
  includeMarketContext: boolean;
  includeSocialSentiment: boolean;
  autoLearnFollows: boolean;
  useMemoryInResponses: boolean;
  showMemoryCitations: boolean;
}

interface MemorySummary {
  followedTeams: FollowedEntity[];
  followedPlayers: FollowedEntity[];
  followedLeagues: FollowedEntity[];
  preferences: MemoryPreferences;
  recentTopics: string[];
  totalInteractions: number;
}

const DEFAULT_PREFERENCES: MemoryPreferences = {
  tone: "balanced",
  detailLevel: "medium",
  focusInjuries: true,
  focusWeather: true,
  focusTrends: true,
  focusLineMovement: true,
  focusMatchups: true,
  includeHistoricalContext: true,
  includeMarketContext: true,
  includeSocialSentiment: false,
  autoLearnFollows: true,
  useMemoryInResponses: true,
  showMemoryCitations: false,
};

function EntityBadge({ 
  entity, 
  onRemove 
}: { 
  entity: FollowedEntity;
  onRemove: () => void;
}) {
  const priorityColor = entity.priority >= 8 
    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
    : entity.priority >= 5
    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";

  return (
    <div className={cn(
      "group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all",
      priorityColor
    )}>
      {entity.autoAdded && (
        <Sparkles className="h-3 w-3 opacity-60" />
      )}
      <span className="font-medium">{entity.entityName}</span>
      <span className="text-xs opacity-60 uppercase">{entity.sportKey}</span>
      {entity.priority >= 8 && (
        <Star className="h-3 w-3 fill-current" />
      )}
      <button
        onClick={onRemove}
        className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ToneOption({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all text-left",
        "hover:border-primary/50 hover:bg-muted/50",
        selected ? "border-primary bg-primary/5" : "border-border"
      )}
    >
      {selected && (
        <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-2.5 w-2.5 text-primary-foreground" />
        </div>
      )}
      <p className={cn("text-sm font-medium", selected && "text-primary")}>{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function FocusToggle({
  icon: Icon,
  label,
  checked,
  onCheckedChange,
}: {
  icon: typeof Activity;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all",
      checked 
        ? "bg-primary/10 text-primary" 
        : "bg-muted/50 text-muted-foreground hover:bg-muted"
    )}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="sr-only"
      />
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
      {checked && <Check className="h-3.5 w-3.5 ml-auto" />}
    </label>
  );
}

export function CoachMemorySettings() {
  const { user, isDemoMode } = useDemoAuth();
  const [summary, setSummary] = useState<MemorySummary | null>(null);
  const [preferences, setPreferences] = useState<MemoryPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  // Load memory summary
  const loadMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/coach/memory/summary");
      if (res.status === 401 || res.status === 403) {
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setPreferences(data.summary.preferences);
      }
    } catch (err) {
      console.error("Failed to load Scout memory:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setLoading(false);
      return;
    }
    loadMemory();
  }, [isDemoMode, loadMemory, user?.id]);

  // Update preferences
  const updatePreferences = async (updates: Partial<MemoryPreferences>) => {
    const newPrefs = { ...preferences, ...updates };
    setPreferences(newPrefs);
    setSaving(true);

    try {
      await fetch("/api/coach/memory/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error("Failed to update preferences:", err);
    } finally {
      setSaving(false);
    }
  };

  // Remove followed entity
  const removeEntity = async (entityType: string, entityKey: string) => {
    try {
      await fetch(`/api/coach/memory/entities/${entityType}/${entityKey}`, {
        method: "DELETE",
      });
      loadMemory();
    } catch (err) {
      console.error("Failed to remove entity:", err);
    }
  };

  // Clear interaction history
  const clearHistory = async () => {
    setClearingHistory(true);
    try {
      await fetch("/api/coach/memory/interactions", { method: "DELETE" });
      loadMemory();
    } catch (err) {
      console.error("Failed to clear history:", err);
    } finally {
      setClearingHistory(false);
    }
  };

  // Clear all memory
  const clearAllMemory = async () => {
    setClearingAll(true);
    try {
      await fetch("/api/coach/memory/clear", { method: "POST" });
      loadMemory();
    } catch (err) {
      console.error("Failed to clear memory:", err);
    } finally {
      setClearingAll(false);
    }
  };

  // Reset preferences to defaults
  const resetPreferences = async () => {
    try {
      await fetch("/api/coach/memory/preferences/reset", { method: "POST" });
      setPreferences(DEFAULT_PREFERENCES);
    } catch (err) {
      console.error("Failed to reset preferences:", err);
    }
  };

  const totalFollowed = summary 
    ? summary.followedTeams.length + summary.followedPlayers.length + summary.followedLeagues.length 
    : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Scout Memory
                <Badge variant="secondary" className="text-[10px]">
                  {totalFollowed} followed
                </Badge>
              </CardTitle>
              <CardDescription>
                Personalize how Scout responds to you
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="gap-1"
          >
            <Settings className="h-4 w-4" />
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Master Toggle */}
            <div className={cn(
              "flex items-center justify-between p-4 rounded-xl border-2 transition-all",
              preferences.useMemoryInResponses
                ? "border-primary bg-primary/5"
                : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  preferences.useMemoryInResponses ? "bg-primary/10" : "bg-muted"
                )}>
                  <Brain className={cn(
                    "h-5 w-5",
                    preferences.useMemoryInResponses ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div>
                  <p className="font-medium">Enable Personalization</p>
                  <p className="text-sm text-muted-foreground">
                    {preferences.useMemoryInResponses
                      ? "Scout uses your memory for tailored responses"
                      : "Scout provides generic responses"}
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.useMemoryInResponses}
                onCheckedChange={(checked) => updatePreferences({ useMemoryInResponses: checked })}
              />
            </div>

            {/* Followed Entities */}
            {totalFollowed > 0 && (
              <div className="space-y-3">
                <Label className="text-base">Followed Entities</Label>
                <p className="text-sm text-muted-foreground">
                  Scout prioritizes information about these teams, players, and leagues
                </p>

                {summary && summary.followedTeams.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>Teams ({summary.followedTeams.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {summary.followedTeams.map((entity) => (
                        <EntityBadge
                          key={entity.id}
                          entity={entity}
                          onRemove={() => removeEntity(entity.entityType, entity.entityKey)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {summary && summary.followedPlayers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>Players ({summary.followedPlayers.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {summary.followedPlayers.map((entity) => (
                        <EntityBadge
                          key={entity.id}
                          entity={entity}
                          onRemove={() => removeEntity(entity.entityType, entity.entityKey)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {summary && summary.followedLeagues.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Trophy className="h-4 w-4" />
                      <span>Leagues ({summary.followedLeagues.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {summary.followedLeagues.map((entity) => (
                        <EntityBadge
                          key={entity.id}
                          entity={entity}
                          onRemove={() => removeEntity(entity.entityType, entity.entityKey)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Auto-Learn Toggle */}
            <div className={cn(
              "flex items-center justify-between p-3 rounded-xl border transition-all",
              preferences.autoLearnFollows ? "border-primary/30 bg-primary/5" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <Sparkles className={cn(
                  "h-4 w-4",
                  preferences.autoLearnFollows ? "text-primary" : "text-muted-foreground"
                )} />
                <div>
                  <p className="text-sm font-medium">Auto-Learn</p>
                  <p className="text-xs text-muted-foreground">
                    Scout learns from your picks and questions
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.autoLearnFollows}
                onCheckedChange={(checked) => updatePreferences({ autoLearnFollows: checked })}
              />
            </div>

            {/* Expanded Settings */}
            {expanded && (
              <>
                <Separator />

                {/* Tone Preference */}
                <div className="space-y-3">
                  <Label className="text-base">Response Tone</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <ToneOption
                      label="Casual"
                      description="Friendly & conversational"
                      selected={preferences.tone === "casual"}
                      onClick={() => updatePreferences({ tone: "casual" })}
                    />
                    <ToneOption
                      label="Balanced"
                      description="Professional but approachable"
                      selected={preferences.tone === "balanced"}
                      onClick={() => updatePreferences({ tone: "balanced" })}
                    />
                    <ToneOption
                      label="Analytical"
                      description="Data-focused & detailed"
                      selected={preferences.tone === "analytical"}
                      onClick={() => updatePreferences({ tone: "analytical" })}
                    />
                  </div>
                </div>

                {/* Detail Level */}
                <div className="space-y-3">
                  <Label className="text-base">Detail Level</Label>
                  <div className="flex gap-2">
                    {([
                      { value: "brief", label: "Brief" },
                      { value: "medium", label: "Medium" },
                      { value: "detailed", label: "Detailed" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updatePreferences({ detailLevel: option.value })}
                        className={cn(
                          "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                          preferences.detailLevel === option.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Focus Areas */}
                <div className="space-y-3">
                  <Label className="text-base">Focus Areas</Label>
                  <p className="text-sm text-muted-foreground">
                    Scout emphasizes these topics in responses
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <FocusToggle
                      icon={Activity}
                      label="Injuries"
                      checked={preferences.focusInjuries}
                      onCheckedChange={(checked) => updatePreferences({ focusInjuries: checked })}
                    />
                    <FocusToggle
                      icon={CloudRain}
                      label="Weather"
                      checked={preferences.focusWeather}
                      onCheckedChange={(checked) => updatePreferences({ focusWeather: checked })}
                    />
                    <FocusToggle
                      icon={TrendingUp}
                      label="Trends"
                      checked={preferences.focusTrends}
                      onCheckedChange={(checked) => updatePreferences({ focusTrends: checked })}
                    />
                    <FocusToggle
                      icon={Zap}
                      label="Line Movement"
                      checked={preferences.focusLineMovement}
                      onCheckedChange={(checked) => updatePreferences({ focusLineMovement: checked })}
                    />
                    <FocusToggle
                      icon={Target}
                      label="Matchups"
                      checked={preferences.focusMatchups}
                      onCheckedChange={(checked) => updatePreferences({ focusMatchups: checked })}
                    />
                    <FocusToggle
                      icon={MessageSquare}
                      label="Social"
                      checked={preferences.includeSocialSentiment}
                      onCheckedChange={(checked) => updatePreferences({ includeSocialSentiment: checked })}
                    />
                  </div>
                </div>

                {/* Context Preferences */}
                <div className="space-y-3">
                  <Label className="text-base">Context Preferences</Label>
                  <div className="space-y-2">
                    <div className={cn(
                      "flex items-center justify-between p-3 rounded-xl border transition-all",
                      preferences.includeHistoricalContext ? "border-primary/30 bg-primary/5" : "border-border"
                    )}>
                      <div className="flex items-center gap-3">
                        <History className={cn(
                          "h-4 w-4",
                          preferences.includeHistoricalContext ? "text-primary" : "text-muted-foreground"
                        )} />
                        <div>
                          <p className="text-sm font-medium">Historical Context</p>
                          <p className="text-xs text-muted-foreground">Include past performance data</p>
                        </div>
                      </div>
                      <Switch
                        checked={preferences.includeHistoricalContext}
                        onCheckedChange={(checked) => updatePreferences({ includeHistoricalContext: checked })}
                      />
                    </div>

                    <div className={cn(
                      "flex items-center justify-between p-3 rounded-xl border transition-all",
                      preferences.includeMarketContext ? "border-primary/30 bg-primary/5" : "border-border"
                    )}>
                      <div className="flex items-center gap-3">
                        <TrendingUp className={cn(
                          "h-4 w-4",
                          preferences.includeMarketContext ? "text-primary" : "text-muted-foreground"
                        )} />
                        <div>
                          <p className="text-sm font-medium">Market Context</p>
                          <p className="text-xs text-muted-foreground">Include odds and line analysis</p>
                        </div>
                      </div>
                      <Switch
                        checked={preferences.includeMarketContext}
                        onCheckedChange={(checked) => updatePreferences({ includeMarketContext: checked })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Interaction Stats */}
                {summary && (
                  <div className="p-4 rounded-xl bg-secondary/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium">Memory Stats</span>
                      <Badge variant="secondary">
                        {summary.totalInteractions} interactions
                      </Badge>
                    </div>
                    {summary.recentTopics.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Recent topics:</p>
                        <div className="flex flex-wrap gap-1">
                          {summary.recentTopics.slice(0, 5).map((topic, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetPreferences}
                    className="gap-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reset Preferences
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-900/20"
                      >
                        <History className="h-3.5 w-3.5" />
                        Clear History
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear Interaction History?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete all recorded questions, picks, and interactions
                          that Scout uses for learning. Followed entities and preferences
                          will be preserved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={clearHistory}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          {clearingHistory ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Clear History
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear All Memory
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Scout Memory?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all followed entities, preferences,
                          and interaction history. Scout will start fresh with no
                          personalization data. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={clearAllMemory}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {clearingAll ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Clear All Memory
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            )}

            {/* Saving indicator */}
            {saving && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
