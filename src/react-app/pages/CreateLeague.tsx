import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Switch } from "@/react-app/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/react-app/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import { Badge } from "@/react-app/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, Trophy, Loader2, AlertCircle, Heart, Skull, TrendingUp, RefreshCw, Shield, Sparkles, SlidersHorizontal, Library } from "lucide-react";
import { Alert, AlertDescription } from "@/react-app/components/ui/alert";
import { SPORTS, POOL_FORMATS, DEFAULT_RULES, type LeagueRules } from "@/react-app/data/sports";
import { cn } from "@/react-app/lib/utils";
import { PoolAccessGate } from "@/react-app/components/PoolAccessGate";
import { PoolTypeBadgeIcon } from "@/react-app/components/pools/PoolTypeBadgeIcon";
import { RuleEnginePreviewCard } from "@/react-app/components/pools/RuleEnginePreviewCard";
import { getPoolTypeByKey, getTemplateForPoolType } from "@/shared/poolTypeCatalog";
import { generatePoolRuleEngineOutput } from "@/shared/poolRuleEngine";

type Step = "sport" | "format" | "variant" | "details" | "rules" | "review";

interface LeagueData {
  name: string;
  sportKey: string;
  formatKey: string;
  poolTypeKey?: string;
  variantKey: string;
  season: string;
  entryFeeCents: number;
  isPaymentRequired: boolean;
  rules: LeagueRules;
}

interface QuickPreset {
  id: string;
  title: string;
  subtitle: string;
  sportKey: string;
  formatKey: string;
  variantKey?: string;
  entryFeeCents?: number;
  isPaymentRequired?: boolean;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "nfl-pickem",
    title: "NFL Pick'em Classic",
    subtitle: "Best for office/friends weekly competition",
    sportKey: "nfl",
    formatKey: "pickem",
    entryFeeCents: 2500,
    isPaymentRequired: true,
  },
  {
    id: "nfl-survivor",
    title: "NFL Survivor",
    subtitle: "Simple elimination format, high engagement",
    sportKey: "nfl",
    formatKey: "survivor",
    variantKey: "winner",
    entryFeeCents: 2000,
    isPaymentRequired: true,
  },
  {
    id: "march-bracket",
    title: "March Madness Bracket",
    subtitle: "Tournament-style pool for big events",
    sportKey: "ncaab",
    formatKey: "bracket",
    entryFeeCents: 1000,
    isPaymentRequired: true,
  },
  {
    id: "nba-confidence",
    title: "NBA Confidence",
    subtitle: "Rank picks by confidence for deeper strategy",
    sportKey: "nba",
    formatKey: "confidence",
  },
];

const STEP_HELP: Record<Step, { title: string; hint: string }> = {
  sport: {
    title: "Pick a launch path",
    hint: "Start with a quick template or choose a sport manually.",
  },
  format: {
    title: "Choose competition style",
    hint: "Formats control how picks are made and scored.",
  },
  variant: {
    title: "Select variant",
    hint: "Variants fine-tune format behavior for your audience.",
  },
  details: {
    title: "Name and configure basics",
    hint: "Set season, entry, and core setup details.",
  },
  rules: {
    title: "Apply rules",
    hint: "Use presets first, then advanced options only if needed.",
  },
  review: {
    title: "Final review",
    hint: "Confirm everything before creating your pool.",
  },
};

function buildRecommendedRules(
  formatKey: string,
  variantKey: string,
  baseRules: LeagueRules = DEFAULT_RULES,
): LeagueRules {
  const recommended: LeagueRules = {
    ...baseRules,
    lockType: "game_start",
    visibilityType: "after_lock",
    tiebreakerType: "total_points",
    allowLateJoins: true,
    useSpread: false,
    survivorType: undefined,
    survivorVariant: undefined,
    survivorLives: undefined,
    survivorReentryFeeCents: undefined,
  };

  if (formatKey === "survivor") {
    recommended.lockType = "first_game";
    recommended.visibilityType = "after_lock";
    recommended.tiebreakerType = "none";
    recommended.survivorType =
      variantKey === "loser" ? "loser" : variantKey === "ats" ? "ats" : "winner";
    recommended.survivorVariant =
      variantKey === "two_life" ? "two_life" : variantKey === "reentry" ? "reentry" : "standard";
    recommended.survivorLives = variantKey === "two_life" ? 2 : 1;
    recommended.survivorReentryFeeCents = variantKey === "reentry" ? 2500 : undefined;
    return recommended;
  }

  if (formatKey === "bracket") {
    recommended.scoringType = "points";
    recommended.pointsPerWin = 2;
    recommended.lockType = "first_game";
    recommended.visibilityType = "after_lock";
    return recommended;
  }

  if (formatKey === "squares") {
    recommended.scoringType = "points";
    recommended.pointsPerWin = 1;
    recommended.lockType = "first_game";
    recommended.visibilityType = "after_period";
    return recommended;
  }

  if (formatKey === "props") {
    recommended.scoringType = "points";
    recommended.pointsPerWin = 1;
    recommended.lockType = "game_start";
    recommended.visibilityType = "after_lock";
    recommended.tiebreakerType = "none";
    return recommended;
  }

  if (formatKey === "confidence") {
    recommended.scoringType = "points";
    recommended.pointsPerWin = 1;
    recommended.useSpread = variantKey === "ats";
    return recommended;
  }

  if (formatKey === "ats") {
    recommended.scoringType = "spread";
    recommended.useSpread = true;
    return recommended;
  }

  return recommended;
}

export function CreateLeague() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTourMode = searchParams.get("tour") === "1";
  const { isDemoMode } = useDemoAuth();
  const [currentStep, setCurrentStep] = useState<Step>("sport");
  const [league, setLeague] = useState<LeagueData>({
    name: "",
    sportKey: "",
    formatKey: "",
    poolTypeKey: "",
    variantKey: "",
    season: "",
    entryFeeCents: 0,
    isPaymentRequired: false,
    rules: DEFAULT_RULES,
  });

  const selectedSport = SPORTS.find((s) => s.key === league.sportKey);
  const selectedFormat = POOL_FORMATS.find((f) => f.key === league.formatKey);
  const selectedVariant = selectedFormat?.variants?.find((v) => v.key === league.variantKey);
  const availableFormats = POOL_FORMATS.filter((f) => f.supportedSports.includes(league.sportKey));
  const hasVariants = selectedFormat?.variants && selectedFormat.variants.length > 0;

  // Dynamic steps based on whether format has variants
  const getSteps = (): { key: Step; label: string }[] => {
    const baseSteps: { key: Step; label: string }[] = [
      { key: "sport", label: "Sport" },
      { key: "format", label: "Format" },
    ];
    
    if (hasVariants) {
      baseSteps.push({ key: "variant", label: "Type" });
    }
    
    baseSteps.push(
      { key: "details", label: "Details" },
      { key: "rules", label: "Rules" },
      { key: "review", label: "Review" }
    );
    
    return baseSteps;
  };

  const STEPS = getSteps();
  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const nextStep = currentStepIndex + 1 < STEPS.length ? STEPS[currentStepIndex + 1] : null;
  const stepHelp = STEP_HELP[currentStep];

  const canProceed = () => {
    switch (currentStep) {
      case "sport":
        return !!league.sportKey;
      case "format":
        return !!league.formatKey;
      case "variant":
        return !!league.variantKey;
      case "details":
        return !!league.name && !!league.season;
      case "rules":
        return true;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].key);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].key);
    } else {
      navigate("/");
    }
  };

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);

  const createFlowRulePreview = useMemo(() => {
    const typeDef = getPoolTypeByKey(league.poolTypeKey || league.formatKey || "");
    const template = getTemplateForPoolType(league.poolTypeKey || league.formatKey || "");
    const scheduleType = typeDef?.schedule_type || ["weekly"];
    const inferredTieHandling = league.rules.tiebreakerType === "none" ? "split" : "push";
    const settings: Record<string, unknown> = {
      ...league.rules,
      tieHandling: inferredTieHandling,
      pointsPerWin: league.rules.scoringType === "points" ? 2 : 1,
      allowLateJoins: true,
      visibilityType: league.rules.visibilityType,
      lockType: league.rules.lockType,
      survivorLives: league.variantKey === "two_life" ? 2 : 1,
      reuse: false,
      buybackStartWeek: league.variantKey === "reentry" ? 1 : 0,
      buybackEndWeek: league.variantKey === "reentry" ? 4 : 0,
    };
    return generatePoolRuleEngineOutput({
      template,
      scheduleType,
      settings,
      userState: {
        picksSubmittedCount: 0,
        eligibleEventsCount: 0,
        missedPicksCount: 0,
        invalidSelectionCount: 0,
        lateEntry: false,
      },
    });
  }, [league]);

  // Keep core details auto-populated so the wizard never feels blocked.
  useEffect(() => {
    if (!selectedSport) return;
    setLeague((prev) => {
      const nextSeason = prev.season || selectedSport.seasons?.[0] || "";
      const nextName = prev.name || `${selectedSport.name}${selectedFormat ? ` ${selectedFormat.name}` : ""} Pool`;
      if (nextSeason === prev.season && nextName === prev.name) return prev;
      return {
        ...prev,
        season: nextSeason,
        name: nextName,
      };
    });
  }, [selectedSport, selectedFormat]);

  const normalizeSportKeyFromTemplate = (sportKey: string): string => {
    const key = String(sportKey || "").toLowerCase().trim();
    const map: Record<string, string> = {
      americanfootball_nfl: "nfl",
      americanfootball_ncaaf: "ncaaf",
      basketball_nba: "nba",
      basketball_ncaab: "ncaab",
      baseball_mlb: "mlb",
      icehockey_nhl: "nhl",
      soccer_epl: "soccer",
      soccer_mls: "soccer",
      golf_pga: "golf",
      mma_ufc: "mma",
    };
    return map[key] || key;
  };

  useEffect(() => {
    const sportParam = searchParams.get("sport");
    const formatParam = searchParams.get("format");
    const poolTypeParam = searchParams.get("poolTypeKey");
    const variantParam = searchParams.get("variant");
    if (!sportParam && !formatParam) return;

    const sportKey = sportParam ? normalizeSportKeyFromTemplate(sportParam) : "";
    const sport = SPORTS.find((s) => s.key === sportKey);
    const format = POOL_FORMATS.find((f) => f.key === formatParam);
    const variantKey = variantParam || format?.variants?.[0]?.key || "";

    setLeague((prev) => ({
      ...prev,
      sportKey: sport ? sport.key : prev.sportKey,
      formatKey: format ? format.key : prev.formatKey,
      poolTypeKey: poolTypeParam || prev.poolTypeKey,
      variantKey: format ? variantKey : prev.variantKey,
      season: sport?.seasons?.[0] || prev.season,
      name: prev.name || `${sport?.name || "Sports"} ${format?.name || "Pool"}`,
      // Guided tour mode should feel instant and production-ready.
      rules: format
        ? buildRecommendedRules(format.key, variantKey, prev.rules)
        : prev.rules,
      entryFeeCents: isTourMode && prev.entryFeeCents === 0 ? 2500 : prev.entryFeeCents,
      isPaymentRequired: isTourMode ? true : prev.isPaymentRequired,
    }));
    setCurrentStep(isTourMode ? "review" : "details");
  }, [searchParams, isTourMode]);

  const applyQuickSetup = () => {
    const season = selectedSport?.seasons?.[0] || league.season;
    const generatedName = selectedFormat
      ? `${selectedSport?.name || "Sports"} ${selectedFormat.name} Pool`
      : `${selectedSport?.name || "Sports"} Pool`;
    setLeague((prev) => ({
      ...prev,
      name: prev.name || generatedName,
      season,
      rules: {
        ...buildRecommendedRules(prev.formatKey, prev.variantKey, prev.rules),
      },
      isPaymentRequired: prev.entryFeeCents > 0 ? true : prev.isPaymentRequired,
    }));
    setCurrentStep("review");
  };

  const applyQuickPreset = (preset: QuickPreset) => {
    const sport = SPORTS.find((s) => s.key === preset.sportKey);
    const format = POOL_FORMATS.find((f) => f.key === preset.formatKey);
    const variantKey = preset.variantKey || format?.variants?.[0]?.key || "";
    const season = sport?.seasons?.[0] || "";
    setLeague({
      name: `${sport?.name || "Sports"} ${format?.name || "Pool"}`,
      sportKey: preset.sportKey,
      formatKey: preset.formatKey,
      poolTypeKey: preset.formatKey,
      variantKey,
      season,
      entryFeeCents: preset.entryFeeCents || 0,
      isPaymentRequired: preset.isPaymentRequired || false,
      rules: {
        ...buildRecommendedRules(preset.formatKey, variantKey, DEFAULT_RULES),
      },
    });
    setCurrentStep("details");
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) {
        headers["X-Demo-Mode"] = "true";
      }
      
      const response = await fetch("/api/leagues", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: league.name,
          sportKey: league.sportKey,
          formatKey: league.formatKey,
          poolTypeKey: league.poolTypeKey || league.formatKey,
          variantKey: league.variantKey,
          season: league.season,
          entryFeeCents: league.entryFeeCents,
          isPaymentRequired: league.isPaymentRequired,
          rules: league.rules,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create league");
      }

      const data = await response.json();
      navigate(isTourMode ? "/pool-admin/pools" : "/", {
        state: { newLeagueId: data.id, inviteCode: data.inviteCode, fromTour: isTourMode },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsCreating(false);
    }
  };

  // Get variant icon for survivor types
  const getVariantIcon = (variantKey: string) => {
    switch (variantKey) {
      case "winner":
        return Heart;
      case "loser":
        return Skull;
      case "ats":
        return TrendingUp;
      case "two_life":
        return Shield;
      case "reentry":
        return RefreshCw;
      default:
        return null;
    }
  };

  // Get variant color for survivor types
  const getVariantColor = (variantKey: string) => {
    switch (variantKey) {
      case "winner":
        return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
      case "loser":
        return "text-red-500 bg-red-500/10 border-red-500/30";
      case "ats":
        return "text-blue-500 bg-blue-500/10 border-blue-500/30";
      case "two_life":
        return "text-purple-500 bg-purple-500/10 border-purple-500/30";
      case "reentry":
        return "text-amber-500 bg-amber-500/10 border-amber-500/30";
      default:
        return "";
    }
  };

  return (
    <PoolAccessGate action="create" variant="replace">
      <div className="max-w-3xl mx-auto space-y-6 px-4 pb-6 sm:px-0 sm:space-y-8">
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-10 w-10 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Create Pool</h1>
          <div className="mt-1">
            <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
              Demo Walkthrough - Step 2 of 3
            </Badge>
          </div>
          <p className="text-muted-foreground">Step {currentStepIndex + 1} of {STEPS.length}: {STEPS[currentStepIndex].label}</p>
          <p className="text-xs sm:text-sm text-muted-foreground/90 mt-1">{stepHelp.title} - {stepHelp.hint}</p>
        </div>
      </div>
      {isTourMode && (
        <Alert className="border-primary/30 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Guided tour mode is active. This pool is prefilled with launch-ready defaults so you can create and preview instantly.
          </AlertDescription>
        </Alert>
      )}

      {/* Progress bar */}
      <div className="flex gap-2">
        {STEPS.map((step, index) => (
          <div
            key={step.key}
            className={`h-2.5 flex-1 rounded-full transition-colors ${
              index <= currentStepIndex ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="flex flex-nowrap overflow-x-auto pb-1 gap-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STEPS.map((step, index) => {
          const isDone = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          return (
            <div
              key={`label-${step.key}`}
              className={cn(
                "shrink-0 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap",
                isCurrent && "border-primary/50 bg-primary/10 text-primary",
                isDone && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                !isDone && !isCurrent && "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              {isDone ? "✓ " : ""}{step.label}
            </div>
          );
        })}
      </div>

      {/* Step: Sport Selection */}
      {currentStep === "sport" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Start Fast
            </CardTitle>
            <CardDescription>Pick a quick template or build from scratch.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/admin/pool-types"
              className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10 hover:border-primary/50"
            >
              <Library className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Browse Full Pool Catalog</p>
                <p className="text-xs text-muted-foreground">Search 81+ pool types with filters, favorites, and one-click launch.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
            </Link>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyQuickPreset(preset)}
                  className="min-h-24 rounded-lg border border-primary/20 bg-primary/5 p-4 text-left hover:border-primary/50 hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{preset.title}</p>
                    <Badge variant="secondary">Quick</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{preset.subtitle}</p>
                </button>
              ))}
            </div>
            <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
              Or build from scratch
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SPORTS.map((sport) => (
                <button
                  key={sport.key}
                  onClick={() => setLeague({ ...league, sportKey: sport.key, formatKey: "", poolTypeKey: "", variantKey: "", season: sport.seasons[0] })}
                  className={`min-h-24 p-4 rounded-lg border-2 text-left transition-all hover:border-primary ${
                    league.sportKey === sport.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <span className="mb-2 block"><sport.icon className="h-8 w-8 mx-auto" /></span>
                  <span className="font-medium">{sport.name}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Format Selection */}
      {currentStep === "format" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle>Choose Pool Format</CardTitle>
            <CardDescription>
              Available formats for {selectedSport?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-medium">Quick setup tip</p>
              <p className="text-xs text-muted-foreground">
                Pick a format now, then use "Quick Setup to Review" to prefill defaults and finish in under a minute.
              </p>
            </div>
            <div className="space-y-3">
              {availableFormats.map((format) => (
                <button
                  key={format.key}
                  onClick={() => {
                    const nextVariantKey = format.variants?.[0]?.key || "";
                    setLeague({
                      ...league,
                      formatKey: format.key,
                      poolTypeKey: format.key,
                      variantKey: nextVariantKey,
                      rules: buildRecommendedRules(format.key, nextVariantKey, league.rules),
                    });
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all hover:border-primary ${
                    league.formatKey === format.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <PoolTypeBadgeIcon formatKey={format.key} size="sm" />
                      <div className="font-medium">{format.name}</div>
                    </div>
                    {format.variants && format.variants.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {format.variants.length} types
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {format.description}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Variant Selection */}
      {currentStep === "variant" && selectedFormat?.variants && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle>Choose {selectedFormat.name} Type</CardTitle>
            <CardDescription>
              Select the specific variant of {selectedFormat.name} pool
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedFormat.variants.map((variant) => {
                const VariantIcon = getVariantIcon(variant.key);
                const colorClass = getVariantColor(variant.key);
                
                return (
                  <button
                    key={variant.key}
                    onClick={() =>
                      setLeague({
                        ...league,
                        variantKey: variant.key,
                        rules: buildRecommendedRules(league.formatKey, variant.key, league.rules),
                      })
                    }
                    className={cn(
                      "w-full p-4 rounded-lg border-2 text-left transition-all hover:border-primary",
                      league.variantKey === variant.key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {VariantIcon && (
                        <div className={cn("p-2 rounded-lg border", colorClass)}>
                          <VariantIcon className="h-5 w-5" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{variant.name}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {variant.description}
                        </div>
                      </div>
                      {league.variantKey === variant.key && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: League Details */}
      {currentStep === "details" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle>League Details</CardTitle>
            <CardDescription>Name your league and set the entry fee</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-2">
                <div>
                  <p className="text-sm font-medium">Fast path</p>
                  <p className="text-xs text-muted-foreground">
                    Auto-fill recommended defaults and jump to review.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={applyQuickSetup} className="h-10 w-full sm:w-auto">
                  Quick Setup to Review
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">League Name</Label>
              <Input
                id="name"
                placeholder="e.g., Office NFL Pool 2024"
                value={league.name}
                onChange={(e) => setLeague({ ...league, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Season</Label>
              <Select
                value={league.season}
                onValueChange={(value) => setLeague({ ...league, season: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectedSport?.seasons.map((season) => (
                    <SelectItem key={season} value={season}>
                      {season}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entryFee">Entry Fee (optional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="entryFee"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={league.entryFeeCents / 100 || ""}
                  onChange={(e) =>
                    setLeague({ ...league, entryFeeCents: Math.round(parseFloat(e.target.value || "0") * 100) })
                  }
                  className="w-32"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Entry fees are tracked for prize eligibility. G1 Sports does not hold funds.
              </p>
            </div>

            {league.entryFeeCents > 0 && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-accent/50">
                <div>
                  <Label>Require Payment for Prizes</Label>
                  <p className="text-sm text-muted-foreground">
                    Only paid members can win prizes
                  </p>
                </div>
                <Switch
                  checked={league.isPaymentRequired}
                  onCheckedChange={(checked) => setLeague({ ...league, isPaymentRequired: checked })}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step: Rules Configuration */}
      {currentStep === "rules" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle>Rules Setup</CardTitle>
            <CardDescription>Choose a preset, then tweak advanced options only if needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setLeague({
                    ...league,
                    rules: {
                      ...league.rules,
                      lockType: "game_start",
                      visibilityType: "after_lock",
                    },
                  })
                }
              >
                Recommended
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setLeague({
                    ...league,
                    rules: {
                      ...league.rules,
                      lockType: "first_game",
                      visibilityType: "after_period",
                    },
                  })
                }
              >
                Competitive
              </Button>
              <Button
                type="button"
                variant={showAdvancedRules ? "default" : "outline"}
                onClick={() => setShowAdvancedRules((prev) => !prev)}
                className="gap-2"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {showAdvancedRules ? "Hide Advanced" : "Show Advanced"}
              </Button>
            </div>
            {/* Survivor-specific info */}
            {league.formatKey === "survivor" && selectedVariant && (
              <div className={cn(
                "p-4 rounded-lg border",
                getVariantColor(league.variantKey)
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {(() => {
                    const Icon = getVariantIcon(league.variantKey);
                    return Icon ? <Icon className="h-5 w-5" /> : null;
                  })()}
                  <span className="font-semibold">{selectedVariant.name} Rules</span>
                </div>
                <p className="text-sm opacity-80">{selectedVariant.description}</p>
                {league.variantKey === "winner" && (
                  <ul className="text-sm mt-2 space-y-1 opacity-80">
                    <li>• Pick one team to WIN each week</li>
                    <li>• If your team loses, you're eliminated</li>
                    <li>• Cannot pick the same team twice</li>
                  </ul>
                )}
                {league.variantKey === "loser" && (
                  <ul className="text-sm mt-2 space-y-1 opacity-80">
                    <li>• Pick one team to LOSE each week</li>
                    <li>• If your team wins, you're eliminated</li>
                    <li>• Cannot pick the same team twice</li>
                  </ul>
                )}
                {league.variantKey === "ats" && (
                  <ul className="text-sm mt-2 space-y-1 opacity-80">
                    <li>• Pick one team to COVER THE SPREAD each week</li>
                    <li>• If your team fails to cover, you're eliminated</li>
                    <li>• Cannot pick the same team twice</li>
                  </ul>
                )}
                {league.variantKey === "two_life" && (
                  <ul className="text-sm mt-2 space-y-1 opacity-80">
                    <li>• Pick one team to WIN each week</li>
                    <li>• You get 2 lives - survive your first loss!</li>
                    <li>• Second loss eliminates you for good</li>
                    <li>• Cannot pick the same team twice</li>
                  </ul>
                )}
                {league.variantKey === "reentry" && (
                  <ul className="text-sm mt-2 space-y-1 opacity-80">
                    <li>• Pick one team to WIN each week</li>
                    <li>• If eliminated, pay entry fee again to re-enter</li>
                    <li>• Re-entries start fresh with full team selection</li>
                    <li>• Multiple entries can win separate prizes</li>
                  </ul>
                )}
              </div>
            )}

            {showAdvancedRules && (league.formatKey === "pickem" || league.formatKey === "confidence") && (
              <div className="space-y-3">
                <Label>Scoring Type</Label>
                <RadioGroup
                  value={league.rules.scoringType}
                  onValueChange={(value) =>
                    setLeague({
                      ...league,
                      rules: { ...league.rules, scoringType: value as LeagueRules["scoringType"] },
                    })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="straight" id="straight" />
                    <Label htmlFor="straight" className="font-normal">
                      Straight Up (pick winners)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="spread" id="spread" />
                    <Label htmlFor="spread" className="font-normal">
                      Against the Spread
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-3">
              <Label>Pick Lock Time</Label>
              <RadioGroup
                value={league.rules.lockType}
                onValueChange={(value) =>
                  setLeague({
                    ...league,
                    rules: { ...league.rules, lockType: value as LeagueRules["lockType"] },
                  })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="game_start" id="game_start" />
                  <Label htmlFor="game_start" className="font-normal">
                    At each game's start time
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="first_game" id="first_game" />
                  <Label htmlFor="first_game" className="font-normal">
                    When first game of the week starts
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label>Pick Visibility</Label>
              <RadioGroup
                value={league.rules.visibilityType}
                onValueChange={(value) =>
                  setLeague({
                    ...league,
                    rules: { ...league.rules, visibilityType: value as LeagueRules["visibilityType"] },
                  })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="immediate" id="immediate" />
                  <Label htmlFor="immediate" className="font-normal">
                    Show picks immediately
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="after_lock" id="after_lock" />
                  <Label htmlFor="after_lock" className="font-normal">
                    Show after picks lock
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="after_period" id="after_period" />
                  <Label htmlFor="after_period" className="font-normal">
                    Show after week ends
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {showAdvancedRules && league.formatKey !== "survivor" && (
              <div className="space-y-3">
                <Label>Tiebreaker</Label>
                <RadioGroup
                  value={league.rules.tiebreakerType}
                  onValueChange={(value) =>
                    setLeague({
                      ...league,
                      rules: { ...league.rules, tiebreakerType: value as LeagueRules["tiebreakerType"] },
                    })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="total_points" id="total_points" />
                    <Label htmlFor="total_points" className="font-normal">
                      Total points prediction
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="monday_night" id="monday_night" />
                    <Label htmlFor="monday_night" className="font-normal">
                      Monday Night score prediction
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="none" />
                    <Label htmlFor="none" className="font-normal">
                      No tiebreaker (split prizes)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <RuleEnginePreviewCard output={createFlowRulePreview} />
          </CardContent>
        </Card>
      )}

      {/* Step: Review */}
      {currentStep === "review" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Review Your League
            </CardTitle>
            <CardDescription>Confirm your settings before creating</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">League Name</span>
                <span className="font-medium">{league.name}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Sport</span>
                <span className="font-medium flex items-center gap-2">
                  {selectedSport && <selectedSport.icon className="h-4 w-4" />}
                  {selectedSport?.name}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Format</span>
                <span className="font-medium">{selectedFormat?.name}</span>
              </div>
              {selectedVariant && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium flex items-center gap-2">
                    {(() => {
                      const Icon = getVariantIcon(league.variantKey);
                      return Icon ? <Icon className="h-4 w-4" /> : null;
                    })()}
                    {selectedVariant.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Season</span>
                <span className="font-medium">{league.season}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Entry Fee</span>
                <span className="font-medium">
                  {league.entryFeeCents > 0 ? `$${(league.entryFeeCents / 100).toFixed(2)}` : "Free"}
                </span>
              </div>
              {league.formatKey !== "survivor" && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Scoring</span>
                  <span className="font-medium capitalize">{league.rules.scoringType}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Lock Time</span>
                <span className="font-medium">
                  {league.rules.lockType === "game_start" ? "Each game start" : "First game"}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Pick Visibility</span>
                <span className="font-medium capitalize">
                  {league.rules.visibilityType.replace("_", " ")}
                </span>
              </div>
            </div>
            <RuleEnginePreviewCard
              output={createFlowRulePreview}
              title="Final Rule Engine Output"
              description="This is the exact rule payload shape your pool will start with."
            />
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Navigation buttons */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={goBack} disabled={isCreating} className="h-10 w-full sm:w-auto">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        {currentStep === "review" ? (
          <Button onClick={handleCreate} disabled={isCreating} className="h-10 gap-2 w-full sm:w-auto">
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Create Pool Now
              </>
            )}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canProceed()} className="h-10 w-full sm:w-auto">
            {nextStep ? `Continue to ${nextStep.label}` : "Continue"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
      {currentStep === "details" && !canProceed() && (
        <p className="text-xs text-muted-foreground mt-1">
          Add a league name and season to continue.
        </p>
      )}
      </div>
    </PoolAccessGate>
  );
}
