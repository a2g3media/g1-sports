import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/react-app/components/ui/card";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import { Switch } from "@/react-app/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/react-app/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/react-app/components/ui/select";
import {
  ArrowLeft, ArrowRight, Check, Trophy, Loader2, AlertCircle,
  Search, X, Star, Users, Layers, Plus,
} from "lucide-react";
import { Alert, AlertDescription } from "@/react-app/components/ui/alert";
import { SPORTS, POOL_FORMATS, DEFAULT_RULES, type LeagueRules } from "@/react-app/data/sports";
import { cn } from "@/react-app/lib/utils";
import { PoolAccessGate } from "@/react-app/components/PoolAccessGate";
import { PoolTypeBadgeIcon } from "@/react-app/components/pools/PoolTypeBadgeIcon";
import { RuleEnginePreviewCard } from "@/react-app/components/pools/RuleEnginePreviewCard";
import { getPoolTypeByKey, getTemplateForPoolType, POOL_TYPE_CATALOG, type PoolTypeDefinition } from "@/shared/poolTypeCatalog";
import { generatePoolRuleEngineOutput } from "@/shared/poolRuleEngine";

type Step = "catalog" | "details" | "rules" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "catalog", label: "Pool Type" },
  { key: "details", label: "Details" },
  { key: "rules", label: "Rules" },
  { key: "review", label: "Review" },
];

interface LeagueData {
  name: string;
  sportKey: string;
  formatKey: string;
  poolTypeKey: string;
  variantKey: string;
  season: string;
  poolDuration: "weekly" | "season" | "tournament";
  entryFeeCents: number;
  isPaymentRequired: boolean;
  entryMode: "single" | "optional" | "required";
  maxEntriesPerUser: number;
  requiredEntries: number;
  rules: LeagueRules;
  missedPickPolicy: "loss" | "no_pick" | "auto_worst";
  allowLateJoins: boolean;
  allowLatePicks: boolean;
  picksPerPeriod: "all" | "custom";
  customPickCount: number;
  hidePicksUntilLock: boolean;
  selectedPoolTypeDef: PoolTypeDefinition | null;
}

const CATALOG_SPORT_LABELS: Record<string, string> = {
  nfl: "NFL", ncaaf: "College Football", nba: "NBA", ncaab: "College Basketball",
  mlb: "MLB", nhl: "NHL", soccer: "Soccer", golf: "Golf",
  mma: "UFC/MMA", nascar: "NASCAR", multi_sport: "Multi-Sport",
};

const TEMPLATE_LABELS: Record<string, string> = {
  pickem: "Pick'em", ats_pickem: "ATS Pick'em", confidence: "Confidence",
  ats_confidence: "ATS Confidence", survivor: "Survivor", squares: "Squares",
  bracket: "Bracket", prop: "Prop", streak: "Streak",
  upset_underdog: "Upset / Underdog", stat_performance: "Stat / Performance",
  last_man_standing: "Last Man Standing", bundle_pool: "Bundle Pool",
};

const STEP_HELP: Record<Step, { title: string; hint: string }> = {
  catalog: { title: "Choose a pool type", hint: "Search, filter, or pick from favorites to start." },
  details: { title: "Name and configure basics", hint: "Set season, entries, and core setup details." },
  rules: { title: "Customize pool rules", hint: "Strong defaults are set. Adjust anything you need." },
  review: { title: "Final review", hint: "Confirm everything before creating your pool." },
};

const CATALOG_FAVORITES_KEY = "create-pool:favorites";

function normalizeSport(s: string): string {
  const m: Record<string, string> = {
    americanfootball_nfl: "nfl", americanfootball_ncaaf: "ncaaf",
    basketball_nba: "nba", basketball_ncaab: "ncaab",
    baseball_mlb: "mlb", icehockey_nhl: "nhl",
    soccer_epl: "soccer", soccer_mls: "soccer",
    golf_pga: "golf", mma_ufc: "mma",
  };
  return m[s] || s;
}

function templateToFormat(t: string): string {
  const m: Record<string, string> = {
    ats_pickem: "ats", ats_confidence: "confidence", prop: "props",
    upset_underdog: "pickem", stat_performance: "pickem",
    last_man_standing: "survivor", bundle_pool: "pickem",
  };
  return m[t] || t;
}

function buildRecommendedRules(formatKey: string, variantKey: string, base: LeagueRules = DEFAULT_RULES): LeagueRules {
  const r: LeagueRules = { ...base, lockType: "game_start", visibilityType: "after_lock", tiebreakerType: "total_points", allowLateJoins: true, useSpread: false, survivorType: undefined, survivorVariant: undefined, survivorLives: undefined, survivorReentryFeeCents: undefined };
  if (formatKey === "survivor") { r.lockType = "first_game"; r.tiebreakerType = "none"; r.survivorType = variantKey === "loser" ? "loser" : variantKey === "ats" ? "ats" : "winner"; r.survivorVariant = variantKey === "two_life" ? "two_life" : variantKey === "reentry" ? "reentry" : "standard"; r.survivorLives = variantKey === "two_life" ? 2 : 1; r.survivorReentryFeeCents = variantKey === "reentry" ? 2500 : undefined; }
  if (formatKey === "bracket") { r.scoringType = "points"; r.pointsPerWin = 2; r.lockType = "first_game"; }
  if (formatKey === "squares") { r.scoringType = "points"; r.pointsPerWin = 1; r.lockType = "first_game"; r.visibilityType = "after_period"; }
  if (formatKey === "props") { r.scoringType = "points"; r.pointsPerWin = 1; r.tiebreakerType = "none"; }
  if (formatKey === "confidence") { r.scoringType = "points"; r.pointsPerWin = 1; r.useSpread = variantKey === "ats"; }
  if (formatKey === "ats") { r.scoringType = "spread"; r.useSpread = true; }
  return r;
}

export function CreateLeague() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTourMode = searchParams.get("tour") === "1";
  const { isDemoMode } = useDemoAuth();
  const [currentStep, setCurrentStep] = useState<Step>("catalog");
  const [league, setLeague] = useState<LeagueData>({
    name: "", sportKey: "", formatKey: "", poolTypeKey: "", variantKey: "",
    season: "2025-2026", poolDuration: "season", entryFeeCents: 0, isPaymentRequired: false,
    entryMode: "single", maxEntriesPerUser: 1, requiredEntries: 3,
    rules: DEFAULT_RULES,
    missedPickPolicy: "loss", allowLateJoins: true, allowLatePicks: false,
    picksPerPeriod: "all", customPickCount: 5, hidePicksUntilLock: true,
    selectedPoolTypeDef: null,
  });

  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogSportFilter, setCatalogSportFilter] = useState("all");
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPool, setCreatedPool] = useState<{ id: number; inviteCode: string } | null>(null);

  useEffect(() => { try { const r = localStorage.getItem(CATALOG_FAVORITES_KEY); if (r) { const p = JSON.parse(r) as unknown; if (Array.isArray(p)) setFavoriteKeys(p.filter((v): v is string => typeof v === "string")); } } catch { setFavoriteKeys([]); } }, []);
  useEffect(() => { try { localStorage.setItem(CATALOG_FAVORITES_KEY, JSON.stringify(favoriteKeys)); } catch { /* ok */ } }, [favoriteKeys]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) && currentStep === "catalog") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape" && document.activeElement === searchRef.current) { if (catalogSearch) { setCatalogSearch(""); } else { searchRef.current?.blur(); } }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [catalogSearch, currentStep]);

  const catalog = POOL_TYPE_CATALOG;
  const catalogSportOptions = useMemo(() => Array.from(new Set(catalog.map((i) => i.sport))).sort(), [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalog.filter((item) => {
      if (catalogSportFilter !== "all" && item.sport !== catalogSportFilter) return false;
      if (q) {
        const h = [item.name, item.key, item.sport, item.template, item.description, ...item.rule_variants.map((v) => `${v.key} ${v.label}`)].join(" ").toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, catalogSportFilter, catalogSearch]);

  const favoriteCatalogItems = useMemo(() => {
    const idx = new Map(catalog.map((i) => [i.key, i]));
    return favoriteKeys.map((k) => idx.get(k)).filter((i): i is PoolTypeDefinition => Boolean(i));
  }, [catalog, favoriteKeys]);

  const toggleFavorite = (key: string) => setFavoriteKeys((p) => p.includes(key) ? p.filter((k) => k !== key) : [key, ...p]);

  const selectCatalogItem = (item: PoolTypeDefinition) => {
    const appSport = normalizeSport(item.sport);
    const sport = SPORTS.find((s) => s.key === appSport);
    const fk = templateToFormat(item.template);
    const format = POOL_FORMATS.find((f) => f.key === fk);
    const vk = item.rule_variants[0]?.key || format?.variants?.[0]?.key || "";
    setLeague((prev) => ({
      ...prev,
      sportKey: appSport, formatKey: fk, poolTypeKey: item.key, variantKey: vk,
      season: sport?.seasons?.[0] || prev.season,
      name: prev.name || `${sport?.name || item.sport} ${item.name}`,
      rules: buildRecommendedRules(fk, vk, prev.rules),
      selectedPoolTypeDef: item,
      hidePicksUntilLock: true,
      missedPickPolicy: fk === "survivor" ? "loss" : "loss",
      allowLateJoins: true,
      allowLatePicks: false,
    }));
    setCurrentStep("details");
  };

  // URL param deep-link support
  useEffect(() => {
    const sp = searchParams.get("sport"), fp = searchParams.get("format"), pk = searchParams.get("poolTypeKey");
    if (!sp && !fp) return;
    const sk = normalizeSport(sp || "");
    const sport = SPORTS.find((s) => s.key === sk);
    const format = POOL_FORMATS.find((f) => f.key === fp);
    const vk = searchParams.get("variant") || format?.variants?.[0]?.key || "";
    const catItem = pk ? catalog.find((c) => c.key === pk) : null;
    setLeague((prev) => ({
      ...prev, sportKey: sport ? sport.key : prev.sportKey, formatKey: format ? format.key : prev.formatKey,
      poolTypeKey: pk || prev.poolTypeKey, variantKey: format ? vk : prev.variantKey,
      season: sport?.seasons?.[0] || prev.season, name: prev.name || `${sport?.name || "Sports"} ${format?.name || "Pool"}`,
      rules: format ? buildRecommendedRules(format.key, vk, prev.rules) : prev.rules,
      entryFeeCents: isTourMode && prev.entryFeeCents === 0 ? 2500 : prev.entryFeeCents,
      isPaymentRequired: isTourMode ? true : prev.isPaymentRequired,
      selectedPoolTypeDef: catItem || prev.selectedPoolTypeDef,
    }));
    setCurrentStep(isTourMode ? "review" : "details");
  }, [searchParams, isTourMode, catalog]);

  const selectedSport = SPORTS.find((s) => s.key === league.sportKey);
  const selectedFormat = POOL_FORMATS.find((f) => f.key === league.formatKey);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const nextStep = currentStepIndex + 1 < STEPS.length ? STEPS[currentStepIndex + 1] : null;
  const stepHelp = STEP_HELP[currentStep];

  const canProceed = () => {
    if (currentStep === "catalog") return !!league.sportKey && !!league.formatKey;
    if (currentStep === "details") return !!league.name.trim() && !!league.season && !!league.sportKey;
    return true;
  };

  const goNext = () => { const ni = currentStepIndex + 1; if (ni < STEPS.length) setCurrentStep(STEPS[ni].key); };
  const goBack = () => { const pi = currentStepIndex - 1; if (pi >= 0) setCurrentStep(STEPS[pi].key); else navigate("/"); };

  const createFlowRulePreview = useMemo(() => {
    const typeDef = getPoolTypeByKey(league.poolTypeKey || league.formatKey || "");
    const template = getTemplateForPoolType(league.poolTypeKey || league.formatKey || "");
    const scheduleType = typeDef?.schedule_type || ["weekly"];
    return generatePoolRuleEngineOutput({
      template, scheduleType,
      settings: { ...league.rules, tieHandling: league.rules.tiebreakerType === "none" ? "split" : "push", pointsPerWin: league.rules.scoringType === "points" ? 2 : 1, allowLateJoins: league.allowLateJoins, visibilityType: league.rules.visibilityType, lockType: league.rules.lockType, survivorLives: league.variantKey === "two_life" ? 2 : 1, reuse: false },
      userState: { picksSubmittedCount: 0, eligibleEventsCount: 0, missedPicksCount: 0, invalidSelectionCount: 0, lateEntry: false },
    });
  }, [league]);

  useEffect(() => {
    if (!selectedSport) return;
    setLeague((prev) => {
      const ns = prev.season || selectedSport.seasons?.[0] || "";
      const nn = prev.name || `${selectedSport.name}${selectedFormat ? ` ${selectedFormat.name}` : ""} Pool`;
      if (ns === prev.season && nn === prev.name) return prev;
      return { ...prev, season: ns, name: nn };
    });
  }, [selectedSport, selectedFormat]);

  const handleCreate = async () => {
    setIsCreating(true); setError(null);
    try {
      if (!league.name?.trim()) { setError("Pool name is required"); setIsCreating(false); return; }
      if (!league.sportKey) { setError("Sport is required"); setIsCreating(false); return; }

      const seasonVal = league.season || (selectedSport?.seasons?.[0]) || new Date().getFullYear().toString();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (isDemoMode) headers["X-Demo-Mode"] = "true";

      const payload = {
        name: league.name.trim(),
        sportKey: league.sportKey,
        formatKey: league.formatKey,
        poolTypeKey: league.poolTypeKey || league.formatKey,
        variantKey: league.variantKey,
        season: seasonVal,
        entryFeeCents: league.entryFeeCents,
        isPaymentRequired: league.isPaymentRequired,
        entryMode: league.entryMode,
        allowMultipleEntries: league.entryMode !== "single",
        maxEntriesPerUser: league.entryMode === "optional" ? league.maxEntriesPerUser : league.entryMode === "required" ? league.requiredEntries : 1,
        requiredEntries: league.entryMode === "required" ? league.requiredEntries : null,
        missedPickPolicy: league.missedPickPolicy,
        allowLateJoins: league.allowLateJoins,
        allowLatePicks: league.allowLatePicks,
        picksPerPeriod: league.picksPerPeriod === "custom" ? league.customPickCount : null,
        hidePicksUntilLock: league.hidePicksUntilLock,
        rules: {
          ...league.rules,
          poolDuration: league.poolDuration,
        },
      };

      const response = await fetch("/api/leagues", { method: "POST", headers, body: JSON.stringify(payload) });

      if (!response.ok) {
        let errorMsg = "Failed to create league";
        try { const d = await response.json(); errorMsg = d.error || d.message || errorMsg; } catch { /* non-JSON response */ }
        throw new Error(errorMsg);
      }

      const data = await response.json() as { id: number; inviteCode: string };
      setCreatedPool(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const poolTypeDef = league.selectedPoolTypeDef;
  const isSurvivor = league.formatKey === "survivor";
  const isConfidence = league.formatKey === "confidence";
  const isBracket = league.formatKey === "bracket";
  const isSquares = league.formatKey === "squares";

  if (createdPool) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <Check className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Pool Created!</h1>
          <p className="text-muted-foreground">{league.name} is ready to go.</p>
        </div>
        <Card className="text-left border-border/60">
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Invite Code</span><span className="font-mono font-bold text-lg tracking-wider">{createdPool.inviteCode}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pool Type</span><span className="font-medium">{poolTypeDef?.name || league.formatKey}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Duration</span><span className="font-medium capitalize">{league.poolDuration === "weekly" ? "Weekly" : league.poolDuration === "tournament" ? "Tournament" : "Full Season"}</span></div>
          </CardContent>
        </Card>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => navigate("/pool-admin/pools")} className="h-11 gap-2">
            <Layers className="h-4 w-4" /> Manage Pools
          </Button>
          <Button variant="outline" onClick={() => { setCreatedPool(null); setCurrentStep("catalog"); setLeague(prev => ({ ...prev, name: "", selectedPoolTypeDef: null })); }} className="h-11 gap-2">
            <Plus className="h-4 w-4" /> Create Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PoolAccessGate action="create" variant="replace">
      <div className="max-w-4xl mx-auto space-y-6 px-4 pb-6 sm:px-0 sm:space-y-8">
      {/* Header */}
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-10 w-10 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Create Pool</h1>
          <p className="text-muted-foreground">Step {currentStepIndex + 1} of {STEPS.length}: {STEPS[currentStepIndex].label}</p>
          <p className="text-xs sm:text-sm text-muted-foreground/90 mt-1">{stepHelp.title} - {stepHelp.hint}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-2">
        {STEPS.map((step, i) => (
          <div key={step.key} className={`h-2.5 flex-1 rounded-full transition-colors ${i <= currentStepIndex ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <div className="flex flex-nowrap overflow-x-auto pb-1 gap-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STEPS.map((step, i) => (
          <div key={`l-${step.key}`} className={cn("shrink-0 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap", i === currentStepIndex && "border-primary/50 bg-primary/10 text-primary", i < currentStepIndex && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", i > currentStepIndex && "border-border bg-muted/40 text-muted-foreground")}>
            {i < currentStepIndex ? "✓ " : ""}{step.label}
          </div>
        ))}
      </div>

      {/* ─── Step 1: Catalog ─── */}
      {currentStep === "catalog" && (
        <div className="space-y-4 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input ref={searchRef} value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} placeholder="Search pool types by name, sport, template, keyword…" className="h-12 pl-10 pr-28 text-sm" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {catalogSearch && <button type="button" onClick={() => setCatalogSearch("")} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
              <span className="text-xs text-muted-foreground tabular-nums">{filteredCatalog.length} pool{filteredCatalog.length !== 1 ? "s" : ""}</span>
              <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">{catalogSearch ? "esc" : "/"}</kbd>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={catalogSportFilter === "all" ? "default" : "outline"} className="h-8" onClick={() => setCatalogSportFilter("all")}>All Sports</Button>
            {catalogSportOptions.map((s) => (
              <Button key={`c-${s}`} size="sm" variant={catalogSportFilter === s ? "default" : "outline"} className="h-8" onClick={() => setCatalogSportFilter(s)}>{CATALOG_SPORT_LABELS[s] || s}</Button>
            ))}
          </div>
          {favoriteCatalogItems.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Your Favorites</p>
              <div className="flex flex-wrap gap-2">
                {favoriteCatalogItems.slice(0, 8).map((item) => (
                  <Button key={`fav-${item.key}`} size="sm" variant="outline" className="h-8" onClick={() => selectCatalogItem(item)}>{item.name}</Button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCatalog.map((item) => (
              <button key={item.key} type="button" onClick={() => selectCatalogItem(item)} className="rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40">
                <div className="flex items-center gap-3">
                  <PoolTypeBadgeIcon formatKey={item.template} poolTypeKey={item.key} sportKey={item.sport} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{CATALOG_SPORT_LABELS[item.sport] || item.sport} • {TEMPLATE_LABELS[item.template] || item.template}</p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleFavorite(item.key); }} className="shrink-0 p-1 rounded hover:bg-accent" title={favoriteKeys.includes(item.key) ? "Remove favorite" : "Add favorite"}>
                    <Star className={cn("h-4 w-4", favoriteKeys.includes(item.key) ? "fill-primary text-primary" : "text-muted-foreground")} />
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{item.description}</p>
                {item.rule_variants.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {item.rule_variants.slice(0, 3).map((v) => <span key={`${item.key}-${v.key}`} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-muted-foreground">{v.label}</span>)}
                    {item.rule_variants.length > 3 && <span className="text-[10px] text-muted-foreground">+{item.rule_variants.length - 3}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
          {filteredCatalog.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No pool types match your search.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => { setCatalogSearch(""); setCatalogSportFilter("all"); }}>Clear Filters</Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2: Details ─── */}
      {currentStep === "details" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle>Pool Details</CardTitle>
            <CardDescription>
              {poolTypeDef ? <><span className="font-medium text-foreground">{poolTypeDef.name}</span> — {poolTypeDef.description}</> : "Name your pool and configure entry settings"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Pool Name</Label>
              <Input id="name" placeholder="e.g., Office NFL Pool 2024" value={league.name} onChange={(e) => setLeague({ ...league, name: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Season</Label>
                <Select value={league.season} onValueChange={(v) => setLeague({ ...league, season: v })}>
                  <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                  <SelectContent>
                    {(selectedSport?.seasons || ["2025-2026", "2025", "2024-2025", "2024"]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pool Duration</Label>
                <Select value={league.poolDuration} onValueChange={(v) => setLeague({ ...league, poolDuration: v as LeagueData["poolDuration"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly (resets each week)</SelectItem>
                    <SelectItem value="season">Full Season (cumulative)</SelectItem>
                    <SelectItem value="tournament">Tournament (bracket/event)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {league.poolDuration === "weekly" ? "Standings reset each week — best for weekly prizes." : league.poolDuration === "season" ? "Points accumulate all season — best for season-long pools." : "Single-event or bracket pool."}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entryFee">Entry Fee (optional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input id="entryFee" type="number" min="0" placeholder="0" value={league.entryFeeCents / 100 || ""} onChange={(e) => setLeague({ ...league, entryFeeCents: Math.round(parseFloat(e.target.value || "0") * 100) })} className="w-32" />
              </div>
            </div>
            {league.entryFeeCents > 0 && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-accent/50">
                <div><Label>Require Payment for Prizes</Label><p className="text-sm text-muted-foreground">Only paid members can win prizes</p></div>
                <Switch checked={league.isPaymentRequired} onCheckedChange={(c) => setLeague({ ...league, isPaymentRequired: c })} />
              </div>
            )}
            {/* Entry Mode */}
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-muted-foreground" /><Label>Entry Mode</Label></div>
              <RadioGroup value={league.entryMode} onValueChange={(v) => setLeague({ ...league, entryMode: v as LeagueData["entryMode"], maxEntriesPerUser: v === "optional" ? Math.max(league.maxEntriesPerUser, 2) : v === "required" ? league.requiredEntries : 1 })}>
                <div className="flex items-start space-x-2"><RadioGroupItem value="single" id="es" className="mt-0.5" /><div><Label htmlFor="es" className="font-normal">Single Entry</Label><p className="text-xs text-muted-foreground">One entry per member (default).</p></div></div>
                <div className="flex items-start space-x-2"><RadioGroupItem value="optional" id="eo" className="mt-0.5" /><div><Label htmlFor="eo" className="font-normal">Optional Multiple Entries</Label><p className="text-xs text-muted-foreground">Members choose how many entries to submit, up to a max.</p></div></div>
                <div className="flex items-start space-x-2"><RadioGroupItem value="required" id="er" className="mt-0.5" /><div><Label htmlFor="er" className="font-normal">Mandatory Multiple Entries</Label><p className="text-xs text-muted-foreground">Every member must submit exactly N entries.</p></div></div>
              </RadioGroup>
              {league.entryMode === "optional" && (
                <div className="space-y-2 pl-6 border-l-2 border-primary/20">
                  <Label>Max Entries Per User</Label>
                  <div className="flex items-center gap-3"><Input type="number" min="2" max="25" value={league.maxEntriesPerUser} onChange={(e) => setLeague({ ...league, maxEntriesPerUser: Math.max(2, Math.min(25, parseInt(e.target.value || "2", 10))) })} className="w-20" /><span className="text-sm text-muted-foreground">entries max</span></div>
                </div>
              )}
              {league.entryMode === "required" && (
                <div className="space-y-2 pl-6 border-l-2 border-amber-500/30">
                  <Label>Required Entries Per User</Label>
                  <div className="flex items-center gap-3"><Input type="number" min="2" max="25" value={league.requiredEntries} onChange={(e) => setLeague({ ...league, requiredEntries: Math.max(2, Math.min(25, parseInt(e.target.value || "3", 10))) })} className="w-20" /><span className="text-sm text-muted-foreground">entries required</span></div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 3: Rules ─── */}
      {currentStep === "rules" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle>Pool Rules</CardTitle>
            <CardDescription>Strong defaults are pre-set for {poolTypeDef?.name || "this pool type"}. Adjust anything you need.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Pick Lock Time */}
            <div className="space-y-3">
              <Label>Pick Lock Time</Label>
              <p className="text-xs text-muted-foreground -mt-1">When are picks locked and can no longer be changed?</p>
              <RadioGroup value={league.rules.lockType} onValueChange={(v) => setLeague({ ...league, rules: { ...league.rules, lockType: v as LeagueRules["lockType"] } })}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="game_start" id="gs" /><Label htmlFor="gs" className="font-normal">At each game's start time</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="first_game" id="fg" /><Label htmlFor="fg" className="font-normal">When first game of the week starts</Label></div>
              </RadioGroup>
            </div>

            {/* Pick Visibility */}
            <div className="space-y-3">
              <Label>Pick Visibility</Label>
              <p className="text-xs text-muted-foreground -mt-1">When can other members see each other's picks?</p>
              <RadioGroup value={league.rules.visibilityType} onValueChange={(v) => setLeague({ ...league, rules: { ...league.rules, visibilityType: v as LeagueRules["visibilityType"] } })}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="immediate" id="vi" /><Label htmlFor="vi" className="font-normal">Show picks immediately</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="after_lock" id="val" /><Label htmlFor="val" className="font-normal">Show after picks lock</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="after_period" id="vap" /><Label htmlFor="vap" className="font-normal">Show after week/period ends</Label></div>
              </RadioGroup>
            </div>

            {/* Missed Pick Policy */}
            <div className="space-y-3">
              <Label>Missed Pick Policy</Label>
              <p className="text-xs text-muted-foreground -mt-1">What happens when a member doesn't submit picks on time?</p>
              <RadioGroup value={league.missedPickPolicy} onValueChange={(v) => setLeague({ ...league, missedPickPolicy: v as LeagueData["missedPickPolicy"] })}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="loss" id="mpl" /><Label htmlFor="mpl" className="font-normal">Count as loss{isSurvivor ? " (eliminated)" : ""}</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="no_pick" id="mpn" /><Label htmlFor="mpn" className="font-normal">No score for that period (0 points)</Label></div>
                {!isSurvivor && <div className="flex items-center space-x-2"><RadioGroupItem value="auto_worst" id="mpa" /><Label htmlFor="mpa" className="font-normal">Auto-assign worst available pick</Label></div>}
              </RadioGroup>
            </div>

            {/* Late Joins */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div><Label>Allow Late Joins</Label><p className="text-xs text-muted-foreground">Let new members join after the pool has started.</p></div>
              <Switch checked={league.allowLateJoins} onCheckedChange={(c) => setLeague({ ...league, allowLateJoins: c })} />
            </div>

            {/* Late Picks */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div><Label>Allow Late Picks</Label><p className="text-xs text-muted-foreground">Let members submit picks for games that haven't started, even after the lock time.</p></div>
              <Switch checked={league.allowLatePicks} onCheckedChange={(c) => setLeague({ ...league, allowLatePicks: c })} />
            </div>

            {/* Picks Per Period (not for survivor/bracket/squares) */}
            {!isSurvivor && !isBracket && !isSquares && (
              <div className="space-y-3">
                <Label>Picks Per Week/Period</Label>
                <p className="text-xs text-muted-foreground -mt-1">How many games must each member pick per period?</p>
                <RadioGroup value={league.picksPerPeriod} onValueChange={(v) => setLeague({ ...league, picksPerPeriod: v as LeagueData["picksPerPeriod"] })}>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="all" id="pa" /><Label htmlFor="pa" className="font-normal">All games (full slate)</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="custom" id="pc" /><Label htmlFor="pc" className="font-normal">Custom number of picks</Label></div>
                </RadioGroup>
                {league.picksPerPeriod === "custom" && (
                  <div className="flex items-center gap-3 pl-6 border-l-2 border-primary/20">
                    <Input type="number" min="1" max="20" value={league.customPickCount} onChange={(e) => setLeague({ ...league, customPickCount: Math.max(1, Math.min(20, parseInt(e.target.value || "5", 10))) })} className="w-20" />
                    <span className="text-sm text-muted-foreground">picks per period</span>
                  </div>
                )}
              </div>
            )}

            {/* Scoring Type (pickem / confidence) */}
            {(league.formatKey === "pickem" || isConfidence) && (
              <div className="space-y-3">
                <Label>Scoring Type</Label>
                <RadioGroup value={league.rules.scoringType} onValueChange={(v) => setLeague({ ...league, rules: { ...league.rules, scoringType: v as LeagueRules["scoringType"] } })}>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="straight" id="ss" /><Label htmlFor="ss" className="font-normal">Straight Up (pick winners)</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="spread" id="ssp" /><Label htmlFor="ssp" className="font-normal">Against the Spread</Label></div>
                  {isConfidence && <div className="flex items-center space-x-2"><RadioGroupItem value="points" id="sp" /><Label htmlFor="sp" className="font-normal">Confidence Points (rank your picks)</Label></div>}
                </RadioGroup>
              </div>
            )}

            {/* Tiebreaker (not for survivor) */}
            {!isSurvivor && (
              <div className="space-y-3">
                <Label>Tiebreaker</Label>
                <RadioGroup value={league.rules.tiebreakerType} onValueChange={(v) => setLeague({ ...league, rules: { ...league.rules, tiebreakerType: v as LeagueRules["tiebreakerType"] } })}>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="total_points" id="tp" /><Label htmlFor="tp" className="font-normal">Total points prediction</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="monday_night" id="mn" /><Label htmlFor="mn" className="font-normal">Monday Night score prediction</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="none" id="tn" /><Label htmlFor="tn" className="font-normal">No tiebreaker (split prizes)</Label></div>
                </RadioGroup>
              </div>
            )}

            {/* Survivor-specific */}
            {isSurvivor && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <Label className="text-emerald-400">Survivor Rules</Label>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>• Pick one team per week — if they lose, you're out.</p>
                  <p>• Each team can only be used once per season.</p>
                  {league.rules.survivorLives && league.rules.survivorLives > 1 && <p>• {league.rules.survivorLives} lives — survive your first {league.rules.survivorLives - 1} loss(es).</p>}
                  {league.rules.survivorVariant === "reentry" && <p>• Re-entry allowed — pay again to restart.</p>}
                </div>
              </div>
            )}

            <RuleEnginePreviewCard output={createFlowRulePreview} />
          </CardContent>
        </Card>
      )}

      {/* ─── Step 4: Review ─── */}
      {currentStep === "review" && (
        <Card className="border-border/60 shadow-sm lg:shadow-md animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5" /> Review Your Pool</CardTitle>
            <CardDescription>Confirm your settings before creating</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {[
                ["Pool Name", league.name],
                ["Pool Type", poolTypeDef?.name || league.poolTypeKey],
                ["Sport", selectedSport?.name || league.sportKey],
                ["Format", TEMPLATE_LABELS[league.selectedPoolTypeDef?.template || ""] || selectedFormat?.name || league.formatKey],
                ["Season", league.season || "2025-2026"],
                ["Pool Duration", league.poolDuration === "weekly" ? "Weekly (resets each week)" : league.poolDuration === "tournament" ? "Tournament" : "Full Season"],
                ["Entry Fee", league.entryFeeCents > 0 ? `$${(league.entryFeeCents / 100).toFixed(2)}` : "Free"],
                ["Entry Mode", league.entryMode === "single" ? "Single entry" : league.entryMode === "optional" ? `Optional, up to ${league.maxEntriesPerUser}` : `Mandatory ${league.requiredEntries} entries`],
                ["Lock Time", league.rules.lockType === "game_start" ? "Each game start" : "First game"],
                ["Visibility", league.rules.visibilityType.replace(/_/g, " ")],
                ["Missed Pick", league.missedPickPolicy === "loss" ? "Count as loss" : league.missedPickPolicy === "no_pick" ? "0 points" : "Auto worst pick"],
                ["Late Joins", league.allowLateJoins ? "Allowed" : "Not allowed"],
                ["Late Picks", league.allowLatePicks ? "Allowed" : "Not allowed"],
                ...(!isSurvivor && !isBracket && !isSquares ? [["Picks Per Period", league.picksPerPeriod === "all" ? "All games" : `${league.customPickCount} picks`]] : []),
                ...(!isSurvivor ? [["Tiebreaker", league.rules.tiebreakerType === "none" ? "Split prizes" : league.rules.tiebreakerType?.replace(/_/g, " ") || "—"]] : []),
              ].map(([label, value], i, arr) => (
                <div key={label} className={cn("flex justify-between py-2", i < arr.length - 1 && "border-b border-border/50")}>
                  <span className="text-muted-foreground text-sm">{label}</span>
                  <span className="font-medium text-sm capitalize">{value}</span>
                </div>
              ))}
            </div>
            <RuleEnginePreviewCard output={createFlowRulePreview} title="Final Rule Engine Output" description="Exact rule payload your pool starts with." />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Nav buttons */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={goBack} disabled={isCreating} className="h-10 w-full sm:w-auto"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        {currentStep === "review" ? (
          <Button onClick={handleCreate} disabled={isCreating} className="h-10 gap-2 w-full sm:w-auto">
            {isCreating ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : <><Check className="h-4 w-4" />Create Pool Now</>}
          </Button>
        ) : currentStep === "catalog" ? null : (
          <Button onClick={goNext} disabled={!canProceed()} className="h-10 w-full sm:w-auto">
            {nextStep ? `Continue to ${nextStep.label}` : "Continue"}<ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
      {currentStep === "details" && !canProceed() && <p className="text-xs text-muted-foreground mt-1">Add a pool name and season to continue.</p>}
      </div>
    </PoolAccessGate>
  );
}
