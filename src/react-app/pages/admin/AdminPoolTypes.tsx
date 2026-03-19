import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";
import { AdminPageHeader } from "@/react-app/components/admin/AdminPageHeader";
import { AdminStatusBadge } from "@/react-app/components/admin/AdminStatusBadge";
import { Button } from "@/react-app/components/ui/button";
import { Input } from "@/react-app/components/ui/input";
import { Label } from "@/react-app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/react-app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/react-app/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/react-app/components/ui/alert-dialog";
import { Checkbox } from "@/react-app/components/ui/checkbox";
import {
  Plus,
  Loader2,
  MoreVertical,
  Copy,
  Archive,
  CheckCircle,
  AlertTriangle,
  Star,
  History,
  Sparkles,
  Clock3,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/react-app/components/ui/dropdown-menu";
import { cn } from "@/react-app/lib/utils";
import { Link } from "react-router-dom";
import { PoolTypeBadgeIcon } from "@/react-app/components/pools/PoolTypeBadgeIcon";
import { getTemplateForPoolType } from "@/shared/poolTypeCatalog";

interface PoolType {
  id: number;
  name: string;
  sport_key: string;
  format_key: string;
  version: string;
  status: string;
  description: string | null;
  allowed_settings_json: string | null;
  allowedSettings: string[] | null;
  created_at: string;
  updated_at: string;
}

interface AdminPoolsPayload {
  pools?: Array<{ id: number }>;
}

interface PoolTypeCatalogItem {
  key: string;
  name: string;
  sport: string;
  template: string;
  rule_variants: Array<{ key: string; label: string }>;
  description: string;
}

const SPORTS = [
  { key: "americanfootball_nfl", label: "NFL" },
  { key: "americanfootball_ncaaf", label: "College Football" },
  { key: "basketball_nba", label: "NBA" },
  { key: "basketball_ncaab", label: "College Basketball" },
  { key: "baseball_mlb", label: "MLB" },
  { key: "icehockey_nhl", label: "NHL" },
  { key: "soccer_epl", label: "Soccer - EPL" },
  { key: "soccer_mls", label: "Soccer - MLS" },
  { key: "golf_pga", label: "PGA Golf" },
  { key: "mma_ufc", label: "UFC/MMA" },
];

const FORMATS = [
  { key: "pickem", label: "Pick'em" },
  { key: "confidence", label: "Confidence Pool" },
  { key: "survivor", label: "Survivor/Eliminator" },
  { key: "bracket", label: "Bracket" },
  { key: "squares", label: "Squares" },
  { key: "props", label: "Props" },
  { key: "ats", label: "Against the Spread" },
];

const TEMPLATE_LABELS: Record<string, string> = {
  pickem: "Pick'em",
  ats_pickem: "ATS Pick'em",
  confidence: "Confidence",
  ats_confidence: "ATS Confidence",
  survivor: "Survivor",
  squares: "Squares",
  bracket: "Bracket",
  prop: "Prop",
  streak: "Streak",
  upset_underdog: "Upset / Underdog",
  stat_performance: "Stat / Performance",
  last_man_standing: "Last Man Standing",
  bundle_pool: "Bundle Pool",
};

const REQUIRED_POOL_TARGET = 60;
const POOL_FAVORITES_STORAGE_KEY = "pool-launcher:favorites";
const POOL_USAGE_STORAGE_KEY = "pool-launcher:usage";
const POOL_RECENT_STORAGE_KEY = "pool-launcher:recent";

function toCreateRoutePoolTypeParams(poolType: PoolType): { sport: string; format: string } {
  const sportMap: Record<string, string> = {
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
  const normalizedSport = sportMap[poolType.sport_key] || poolType.sport_key;
  const template = getTemplateForPoolType(poolType.format_key) || poolType.format_key;
  const formatForCreate = template === "ats_pickem"
    ? "ats"
    : template === "ats_confidence"
    ? "confidence"
    : template === "prop"
    ? "props"
    : template === "upset_underdog"
    ? "upset"
    : template === "stat_performance"
    ? "stat"
    : template === "last_man_standing"
    ? "survivor"
    : template === "bundle_pool"
    ? "special"
    : template;
  return { sport: normalizedSport, format: formatForCreate };
}

const ALLOWED_SETTINGS_OPTIONS = [
  { key: "entry_fee", label: "Entry Fee" },
  { key: "max_entries", label: "Max Entries Per User" },
  { key: "late_entry", label: "Allow Late Entry" },
  { key: "auto_lock", label: "Auto-Lock Picks" },
  { key: "tiebreaker", label: "Tiebreaker Question" },
  { key: "payout_structure", label: "Custom Payout Structure" },
  { key: "visibility", label: "Pick Visibility (Public/Private)" },
  { key: "notifications", label: "Custom Notifications" },
  { key: "reentry", label: "Re-entry on Elimination" },
  { key: "multi_entry", label: "Multiple Entries" },
];

export function AdminPoolTypes() {
  const { isDemoMode, exitDemoMode, enterDemoMode, enterDevMode, redirectToLogin } = useDemoAuth();
  const [poolTypes, setPoolTypes] = useState<PoolType[]>([]);
  const [createdPoolCount, setCreatedPoolCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [isVersionOpen, setIsVersionOpen] = useState(false);
  const [isDeprecateOpen, setIsDeprecateOpen] = useState(false);
  const [selectedPoolType, setSelectedPoolType] = useState<PoolType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [catalog, setCatalog] = useState<PoolTypeCatalogItem[]>([]);
  const [catalogSportFilter, setCatalogSportFilter] = useState("all");
  const [catalogTemplateFilter, setCatalogTemplateFilter] = useState("all");
  const [catalogVariantFilter, setCatalogVariantFilter] = useState("all");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(96);
  const [favoritePoolKeys, setFavoritePoolKeys] = useState<string[]>([]);
  const [poolLaunchUsage, setPoolLaunchUsage] = useState<Record<string, number>>({});
  const [recentPoolKeys, setRecentPoolKeys] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    sport_key: "",
    format_key: "",
    description: "",
    allowed_settings: [] as string[],
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        if (catalogSearch) {
          setCatalogSearch("");
        } else {
          searchInputRef.current?.blur();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [catalogSearch]);

  const fetchPoolTypes = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      // Clear stale rows so we never keep showing old demo data after mode changes.
      setPoolTypes([]);
      const headers: HeadersInit = isDemoMode ? { "X-Demo-Mode": "true" } : {};
      const [templatesRes, poolsRes, catalogRes] = await Promise.all([
        fetch("/api/admin/pool-types", { credentials: "include", headers }),
        fetch("/api/admin/pools?limit=500", { credentials: "include", headers }),
        fetch("/api/admin/pool-types/catalog", { credentials: "include", headers }),
      ]);
      if (!templatesRes.ok) {
        if (templatesRes.status === 401 || templatesRes.status === 403) {
          throw new Error("Unauthorized for Pool Type Library. Sign in with super admin access.");
        }
        throw new Error(`Failed to load pool types (HTTP ${templatesRes.status})`);
      }
      const result = await templatesRes.json() as { poolTypes?: PoolType[] };
      setPoolTypes(Array.isArray(result.poolTypes) ? result.poolTypes : []);
      if (catalogRes.ok) {
        const catalogPayload = await catalogRes.json() as { templates?: PoolTypeCatalogItem[] };
        setCatalog(Array.isArray(catalogPayload.templates) ? catalogPayload.templates : []);
      } else {
        setCatalog([]);
      }
      if (poolsRes.ok) {
        const poolPayload = await poolsRes.json() as AdminPoolsPayload;
        setCreatedPoolCount(Array.isArray(poolPayload.pools) ? poolPayload.pools.length : 0);
      } else {
        setCreatedPoolCount(null);
      }
    } catch (error) {
      console.error("Failed to fetch pool types:", error);
      setLoadError(error instanceof Error ? error.message : "Failed to load pool types.");
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    fetchPoolTypes();
  }, [fetchPoolTypes]);

  useEffect(() => {
    try {
      const favoritesRaw = localStorage.getItem(POOL_FAVORITES_STORAGE_KEY);
      if (favoritesRaw) {
        const parsed = JSON.parse(favoritesRaw) as unknown;
        if (Array.isArray(parsed)) {
          setFavoritePoolKeys(parsed.filter((value): value is string => typeof value === "string"));
        }
      }
      const usageRaw = localStorage.getItem(POOL_USAGE_STORAGE_KEY);
      if (usageRaw) {
        const parsed = JSON.parse(usageRaw) as unknown;
        if (parsed && typeof parsed === "object") {
          const usageMap = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
              .filter(([, value]) => Number.isFinite(Number(value))),
          ) as Record<string, number>;
          setPoolLaunchUsage(usageMap);
        }
      }
      const recentRaw = localStorage.getItem(POOL_RECENT_STORAGE_KEY);
      if (recentRaw) {
        const parsed = JSON.parse(recentRaw) as unknown;
        if (Array.isArray(parsed)) {
          setRecentPoolKeys(parsed.filter((value): value is string => typeof value === "string"));
        }
      }
    } catch {
      // Keep launcher usable even if local storage payload is corrupted.
      setFavoritePoolKeys([]);
      setPoolLaunchUsage({});
      setRecentPoolKeys([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(POOL_FAVORITES_STORAGE_KEY, JSON.stringify(favoritePoolKeys));
    } catch {
      // Ignore localStorage write failures (private browsing, quota).
    }
  }, [favoritePoolKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(POOL_USAGE_STORAGE_KEY, JSON.stringify(poolLaunchUsage));
    } catch {
      // Ignore localStorage write failures (private browsing, quota).
    }
  }, [poolLaunchUsage]);

  useEffect(() => {
    try {
      localStorage.setItem(POOL_RECENT_STORAGE_KEY, JSON.stringify(recentPoolKeys));
    } catch {
      // Ignore localStorage write failures (private browsing, quota).
    }
  }, [recentPoolKeys]);

  const handleCreate = async () => {
    if (!formData.name || !formData.sport_key || !formData.format_key) return;

    try {
      setIsSaving(true);
      const response = await fetch("/api/admin/pool-types", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { 'X-Demo-Mode': 'true' } : {}) },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name,
          sport_key: formData.sport_key,
          format_key: formData.format_key,
          description: formData.description || null,
          allowed_settings: formData.allowed_settings,
        }),
      });

      if (response.ok) {
        setIsCreateOpen(false);
        resetForm();
        fetchPoolTypes();
      }
    } catch (error) {
      console.error("Failed to create pool type:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVersion = async () => {
    if (!selectedPoolType) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/admin/pool-types/${selectedPoolType.id}/version`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { 'X-Demo-Mode': 'true' } : {}) },
        credentials: "include",
        body: JSON.stringify({
          description: formData.description || selectedPoolType.description,
          allowed_settings: formData.allowed_settings.length > 0 
            ? formData.allowed_settings 
            : selectedPoolType.allowedSettings,
        }),
      });

      if (response.ok) {
        setIsVersionOpen(false);
        setSelectedPoolType(null);
        resetForm();
        fetchPoolTypes();
      }
    } catch (error) {
      console.error("Failed to version pool type:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeprecate = async () => {
    if (!selectedPoolType) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/admin/pool-types/${selectedPoolType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { 'X-Demo-Mode': 'true' } : {}) },
        credentials: "include",
        body: JSON.stringify({ status: "deprecated" }),
      });

      if (response.ok) {
        setIsDeprecateOpen(false);
        setSelectedPoolType(null);
        fetchPoolTypes();
      }
    } catch (error) {
      console.error("Failed to deprecate pool type:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async (poolType: PoolType) => {
    try {
      const response = await fetch(`/api/admin/pool-types/${poolType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(isDemoMode ? { 'X-Demo-Mode': 'true' } : {}) },
        credentials: "include",
        body: JSON.stringify({ status: "active" }),
      });

      if (response.ok) {
        fetchPoolTypes();
      }
    } catch (error) {
      console.error("Failed to activate pool type:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      sport_key: "",
      format_key: "",
      description: "",
      allowed_settings: [],
    });
  };

  const openVersionDialog = (poolType: PoolType) => {
    setSelectedPoolType(poolType);
    setFormData({
      name: poolType.name,
      sport_key: poolType.sport_key,
      format_key: poolType.format_key,
      description: poolType.description || "",
      allowed_settings: poolType.allowedSettings || [],
    });
    setIsVersionOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getSportLabel = (key: string) => {
    return SPORTS.find(s => s.key === key)?.label || key;
  };

  const getFormatLabel = (key: string) => {
    return FORMATS.find(f => f.key === key)?.label || key;
  };

  const getCatalogSportLabel = (key: string) => {
    return SPORTS.find(s => s.key === key)?.label || key.replaceAll("_", " ");
  };

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalog.filter((item) => {
      if (catalogSportFilter !== "all" && item.sport !== catalogSportFilter) return false;
      if (catalogTemplateFilter !== "all" && item.template !== catalogTemplateFilter) return false;
      if (
        catalogVariantFilter !== "all"
        && !item.rule_variants.some((variant) => variant.key === catalogVariantFilter)
      ) return false;
      if (q) {
        const haystack = [
          item.name,
          item.key,
          item.sport,
          item.template,
          item.description,
          ...item.rule_variants.map((v) => `${v.key} ${v.label}`),
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, catalogSportFilter, catalogTemplateFilter, catalogVariantFilter, catalogSearch]);

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogSportFilter, catalogTemplateFilter, catalogVariantFilter, catalogSearch, catalogPageSize]);

  const totalCatalogPages = Math.max(1, Math.ceil(filteredCatalog.length / catalogPageSize));
  const safeCatalogPage = Math.min(catalogPage, totalCatalogPages);
  const pagedCatalog = useMemo(() => {
    const start = (safeCatalogPage - 1) * catalogPageSize;
    return filteredCatalog.slice(start, start + catalogPageSize);
  }, [filteredCatalog, safeCatalogPage, catalogPageSize]);

  const pageWindow = useMemo(() => {
    const span = 5;
    const start = Math.max(1, safeCatalogPage - 2);
    const end = Math.min(totalCatalogPages, start + span - 1);
    const adjustedStart = Math.max(1, end - span + 1);
    const pages: number[] = [];
    for (let p = adjustedStart; p <= end; p += 1) pages.push(p);
    return pages;
  }, [safeCatalogPage, totalCatalogPages]);

  const catalogSportOptions = useMemo(() => {
    return Array.from(new Set(catalog.map((item) => item.sport))).sort();
  }, [catalog]);

  const catalogTemplateOptions = useMemo(() => {
    return Array.from(new Set(catalog.map((item) => item.template))).sort();
  }, [catalog]);

  const catalogVariantOptions = useMemo(() => {
    const all = new Set<string>();
    for (const item of catalog) {
      for (const variant of item.rule_variants) all.add(variant.key);
    }
    return Array.from(all).sort();
  }, [catalog]);

  const sportLauncherChips = useMemo(() => {
    return catalogSportOptions.slice(0, 12);
  }, [catalogSportOptions]);

  const favoriteCatalogItems = useMemo(() => {
    const index = new Map(catalog.map((item) => [item.key, item]));
    return favoritePoolKeys.map((key) => index.get(key)).filter((item): item is PoolTypeCatalogItem => Boolean(item));
  }, [catalog, favoritePoolKeys]);

  const mostUsedCatalogItems = useMemo(() => {
    const index = new Map(catalog.map((item) => [item.key, item]));
    return Object.entries(poolLaunchUsage)
      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
      .slice(0, 8)
      .map(([key]) => index.get(key))
      .filter((item): item is PoolTypeCatalogItem => Boolean(item));
  }, [catalog, poolLaunchUsage]);

  const recentCatalogItems = useMemo(() => {
    const index = new Map(catalog.map((item) => [item.key, item]));
    return recentPoolKeys
      .map((key) => index.get(key))
      .filter((item): item is PoolTypeCatalogItem => Boolean(item))
      .slice(0, 8);
  }, [catalog, recentPoolKeys]);

  const recommendedCatalogItems = useMemo(() => {
    const now = new Date();
    const month = now.getMonth() + 1; // 1..12

    const isInRange = (start: number, end: number): boolean => (
      start <= end ? (month >= start && month <= end) : (month >= start || month <= end)
    );

    const sportSeasonBoost = (sport: string): number => {
      const key = sport.toLowerCase();
      if (key === "americanfootball_nfl") return isInRange(8, 2) ? 12 : 2;
      if (key === "americanfootball_ncaaf") return isInRange(8, 1) ? 10 : 2;
      if (key === "basketball_ncaab") return isInRange(11, 4) ? 10 : 3;
      if (key === "basketball_nba") return isInRange(10, 6) ? 9 : 4;
      if (key === "icehockey_nhl") return isInRange(10, 6) ? 8 : 4;
      if (key === "baseball_mlb") return isInRange(3, 10) ? 9 : 2;
      if (key.startsWith("soccer_")) return isInRange(2, 11) ? 7 : 5;
      if (key === "golf_pga") return isInRange(1, 9) ? 7 : 3;
      if (key === "mma_ufc") return 6;
      if (key.startsWith("nascar_")) return isInRange(2, 11) ? 7 : 3;
      return 3;
    };

    const templateBoost = (template: string): number => {
      const t = template.toLowerCase();
      if (t === "survivor") return 8;
      if (t === "pickem" || t === "ats_pickem") return 7;
      if (t === "confidence" || t === "ats_confidence") return 6;
      if (t === "props") return 4;
      if (t === "streak") return 4;
      if (t === "squares") return 5;
      if (t === "bracket") return isInRange(2, 4) ? 14 : 3;
      return 3;
    };

    return [...catalog]
      .map((item) => {
        const usageBoost = Math.min(10, Number(poolLaunchUsage[item.key] || 0));
        const score = sportSeasonBoost(item.sport) + templateBoost(item.template) + usageBoost;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.item);
  }, [catalog, poolLaunchUsage]);

  const toggleFavoritePoolKey = (poolTypeKey: string) => {
    setFavoritePoolKeys((prev) => (
      prev.includes(poolTypeKey) ? prev.filter((key) => key !== poolTypeKey) : [poolTypeKey, ...prev]
    ));
  };

  const trackCatalogLaunch = (poolTypeKey: string) => {
    setPoolLaunchUsage((prev) => ({
      ...prev,
      [poolTypeKey]: Number(prev[poolTypeKey] || 0) + 1,
    }));
    setRecentPoolKeys((prev) => {
      const next = [poolTypeKey, ...prev.filter((key) => key !== poolTypeKey)];
      return next.slice(0, 20);
    });
  };

  const clearLauncherPersonalization = () => {
    setFavoritePoolKeys([]);
    setPoolLaunchUsage({});
    setRecentPoolKeys([]);
    try {
      localStorage.removeItem(POOL_FAVORITES_STORAGE_KEY);
      localStorage.removeItem(POOL_USAGE_STORAGE_KEY);
      localStorage.removeItem(POOL_RECENT_STORAGE_KEY);
    } catch {
      // Non-fatal if storage clear fails.
    }
  };

  const catalogCoverage = useMemo(() => {
    const sportsCovered = new Set(catalog.map((item) => item.sport)).size;
    const templatesCovered = new Set(catalog.map((item) => item.template)).size;
    const requirementMet = catalog.length >= REQUIRED_POOL_TARGET;
    return {
      sportsCovered,
      templatesCovered,
      requirementMet,
      statusText: requirementMet
        ? `Requirement met (${catalog.length}/${REQUIRED_POOL_TARGET}+ templates)`
        : `Requirement short (${catalog.length}/${REQUIRED_POOL_TARGET}+ templates)`,
    };
  }, [catalog]);

  const clearCatalogFilters = () => {
    setCatalogSportFilter("all");
    setCatalogTemplateFilter("all");
    setCatalogVariantFilter("all");
    setCatalogSearch("");
    setCatalogPage(1);
  };

  const handleExitDemoMode = async () => {
    await exitDemoMode();
    try {
      const res = await fetch("/api/users/me", { credentials: "include" });
      if (!res.ok) {
        // Stay usable: revert back to demo mode and show clear next-step.
        enterDemoMode();
        setLoadError("Real mode requires sign-in. Use 'Sign in to real mode' to load your real pool types.");
        return;
      }
      // Refresh with real-mode session context.
      window.location.reload();
    } catch {
      enterDemoMode();
      setLoadError("Unable to verify real session. Stayed in demo mode.");
    }
  };

  const handleBypassLogin = async () => {
    enterDevMode("super_admin");
    setLoadError(null);
    await fetchPoolTypes();
  };

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Pool Templates"
        description="Template definitions used to create pools. Templates are not the same as individual pools."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/pools">Open Marketplace</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/pool-admin/pools">Manage Created Pools</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/create-league">Create New Pool</Link>
            </Button>
            <Button onClick={() => setIsCreateOpen(true)} size="sm" className="h-9">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Template
            </Button>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">
        <div className="mb-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-primary/80">Demo Walkthrough - Step 1 of 3</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">Choose a template, then launch straight into create flow.</p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button asChild size="sm" className="h-9 w-full sm:w-auto">
                <Link to="/create-league?sport=nfl&format=pickem&tour=1">Start Guided Tour</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
                <Link to="/create-league?sport=ncaab&format=bracket&tour=1">March Madness Tour</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Templates</p>
            <p className="text-2xl font-bold">{poolTypes.length}</p>
            <p className="text-xs text-muted-foreground">Reusable pool blueprints</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Created Pools</p>
            <p className="text-2xl font-bold">{createdPoolCount ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Live pool instances commissioners manage</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">How to use</p>
            <p className="text-sm font-medium">1) Pick template 2) Create pool 3) Manage members/payouts</p>
          </div>
        </div>
        {isDemoMode && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-100 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
            <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-300 shrink-0" />
            <p>
              Demo mode is active. Pool type results may not reflect your real account data.
              Exit demo mode to view your actual pool type library.
            </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-full sm:w-auto border-amber-300/40 text-amber-100 hover:bg-amber-500/20"
                onClick={handleExitDemoMode}
              >
                Exit Demo
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-full sm:w-auto border-emerald-300/40 text-emerald-100 hover:bg-emerald-500/20"
                onClick={handleBypassLogin}
              >
                Bypass login (demo super admin)
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-full sm:w-auto border-emerald-300/40 text-emerald-100 hover:bg-emerald-500/20"
                onClick={redirectToLogin}
              >
                Sign in to real mode
              </Button>
            </div>
          </div>
        )}
        {loadError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loadError}
          </div>
        )}
        {!isLoading && (catalog.length > 0 || poolTypes.length > 0) && (
          <div className="mb-4">
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-primary/80">Master Catalog Browser</p>
                  <p className="text-sm font-medium">
                    Browse exact approved pool types and launch create flow with pinned pool type key.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    Showing {filteredCatalog.length} of {catalog.length} catalog types
                  </p>
                  <p
                    className={cn(
                      "text-xs font-medium",
                      catalogCoverage.requirementMet ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {catalogCoverage.statusText}
                  </p>
                </div>
              </div>
              <div className="mt-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search pool types by name, sport, template, keyword…"
                  className="h-11 pl-10 pr-32 text-sm"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {catalogSearch && (
                    <button
                      type="button"
                      onClick={() => setCatalogSearch("")}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {filteredCatalog.length} result{filteredCatalog.length !== 1 ? "s" : ""}
                  </span>
                  <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
                    {catalogSearch ? "esc" : "/"}
                  </kbd>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Catalog templates</p>
                  <p className="text-base font-semibold">{catalog.length}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sports covered</p>
                  <p className="text-base font-semibold">{catalogCoverage.sportsCovered}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Templates covered</p>
                  <p className="text-base font-semibold">{catalogCoverage.templatesCovered}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Select value={catalogSportFilter} onValueChange={setCatalogSportFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Filter by sport" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sports</SelectItem>
                    {catalogSportOptions.map((sport) => (
                      <SelectItem key={sport} value={sport}>{getCatalogSportLabel(sport)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={catalogTemplateFilter} onValueChange={setCatalogTemplateFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Filter by template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All templates</SelectItem>
                    {catalogTemplateOptions.map((template) => (
                      <SelectItem key={template} value={template}>
                        {TEMPLATE_LABELS[template] || template}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={catalogVariantFilter} onValueChange={setCatalogVariantFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Filter by variant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All variants</SelectItem>
                    {catalogVariantOptions.map((variant) => (
                      <SelectItem key={variant} value={variant}>{variant.replaceAll("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Quick Sports</span>
                <Button
                  size="sm"
                  variant={catalogSportFilter === "all" ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setCatalogSportFilter("all")}
                >
                  All
                </Button>
                {sportLauncherChips.map((sport) => (
                  <Button
                    key={`sport-chip-${sport}`}
                    size="sm"
                    variant={catalogSportFilter === sport ? "default" : "outline"}
                    className="h-8"
                    onClick={() => setCatalogSportFilter(sport)}
                  >
                    {getCatalogSportLabel(sport)}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={clearCatalogFilters}
                >
                  Reset Filters
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    clearCatalogFilters();
                    setCatalogPageSize(Math.max(96, catalog.length || 96));
                  }}
                >
                  Show All Templates
                </Button>
              </div>
              <div className="mt-3 rounded-lg border border-border/70 bg-card/70 px-3 py-2">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quick Launch</p>
                    <p className="text-xs text-muted-foreground">Pin favorites and jump from most-used pool types.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={clearLauncherPersonalization}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset launcher history
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" /> Trending / Recommended
                    </span>
                    {recommendedCatalogItems.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Loading recommendations...</span>
                    ) : (
                      recommendedCatalogItems.map((item) => {
                        const createParams = toCreateRoutePoolTypeParams({
                          id: 0,
                          name: item.name,
                          sport_key: item.sport,
                          format_key: item.key,
                          version: "v1",
                          status: "active",
                          description: item.description,
                          allowed_settings_json: null,
                          allowedSettings: null,
                          created_at: "",
                          updated_at: "",
                        });
                        const createHref = `/create-league?sport=${encodeURIComponent(createParams.sport)}&format=${encodeURIComponent(createParams.format)}&poolTypeKey=${encodeURIComponent(item.key)}`;
                        return (
                          <Button
                            key={`recommended-${item.key}`}
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => trackCatalogLaunch(item.key)}
                          >
                            <Link to={createHref}>{item.name}</Link>
                          </Button>
                        );
                      })
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Star className="h-3.5 w-3.5" /> Favorites
                    </span>
                    {favoriteCatalogItems.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No favorites yet. Tap the star on any card.</span>
                    ) : (
                      favoriteCatalogItems.slice(0, 8).map((item) => {
                        const createParams = toCreateRoutePoolTypeParams({
                          id: 0,
                          name: item.name,
                          sport_key: item.sport,
                          format_key: item.key,
                          version: "v1",
                          status: "active",
                          description: item.description,
                          allowed_settings_json: null,
                          allowedSettings: null,
                          created_at: "",
                          updated_at: "",
                        });
                        const createHref = `/create-league?sport=${encodeURIComponent(createParams.sport)}&format=${encodeURIComponent(createParams.format)}&poolTypeKey=${encodeURIComponent(item.key)}`;
                        return (
                          <Button
                            key={`fav-${item.key}`}
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => trackCatalogLaunch(item.key)}
                          >
                            <Link to={createHref}>{item.name}</Link>
                          </Button>
                        );
                      })
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" /> Recently Launched
                    </span>
                    {recentCatalogItems.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No recent launches yet.</span>
                    ) : (
                      recentCatalogItems.map((item) => {
                        const createParams = toCreateRoutePoolTypeParams({
                          id: 0,
                          name: item.name,
                          sport_key: item.sport,
                          format_key: item.key,
                          version: "v1",
                          status: "active",
                          description: item.description,
                          allowed_settings_json: null,
                          allowedSettings: null,
                          created_at: "",
                          updated_at: "",
                        });
                        const createHref = `/create-league?sport=${encodeURIComponent(createParams.sport)}&format=${encodeURIComponent(createParams.format)}&poolTypeKey=${encodeURIComponent(item.key)}`;
                        return (
                          <Button
                            key={`recent-${item.key}`}
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => trackCatalogLaunch(item.key)}
                          >
                            <Link to={createHref}>{item.name}</Link>
                          </Button>
                        );
                      })
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <History className="h-3.5 w-3.5" /> Most Used
                    </span>
                    {mostUsedCatalogItems.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Launch a pool type to build quick history.</span>
                    ) : (
                      mostUsedCatalogItems.map((item) => {
                        const createParams = toCreateRoutePoolTypeParams({
                          id: 0,
                          name: item.name,
                          sport_key: item.sport,
                          format_key: item.key,
                          version: "v1",
                          status: "active",
                          description: item.description,
                          allowed_settings_json: null,
                          allowedSettings: null,
                          created_at: "",
                          updated_at: "",
                        });
                        const createHref = `/create-league?sport=${encodeURIComponent(createParams.sport)}&format=${encodeURIComponent(createParams.format)}&poolTypeKey=${encodeURIComponent(item.key)}`;
                        return (
                          <Button
                            key={`used-${item.key}`}
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => trackCatalogLaunch(item.key)}
                          >
                            <Link to={createHref}>
                              {item.name}
                              <span className="ml-1 text-[10px] text-muted-foreground">({Number(poolLaunchUsage[item.key] || 0)})</span>
                            </Link>
                          </Button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pagedCatalog.map((item) => {
                  const createParams = toCreateRoutePoolTypeParams({
                    id: 0,
                    name: item.name,
                    sport_key: item.sport,
                    format_key: item.key,
                    version: "v1",
                    status: "active",
                    description: item.description,
                    allowed_settings_json: null,
                    allowedSettings: null,
                    created_at: "",
                    updated_at: "",
                  });
                  const createHref = `/create-league?sport=${encodeURIComponent(createParams.sport)}&format=${encodeURIComponent(createParams.format)}&poolTypeKey=${encodeURIComponent(item.key)}`;
                  return (
                    <div
                      key={item.key}
                      className="rounded-xl border border-border/70 bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-lg"
                    >
                      <div className="flex items-center gap-3">
                        <PoolTypeBadgeIcon
                          formatKey={item.template}
                          poolTypeKey={item.key}
                          sportKey={item.sport}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {getCatalogSportLabel(item.sport)} • {TEMPLATE_LABELS[item.template] || item.template}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground line-clamp-2 min-h-[2.2rem]">{item.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {item.rule_variants.slice(0, 3).map((variant) => (
                          <span
                            key={`${item.key}-${variant.key}`}
                            className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {variant.label}
                          </span>
                        ))}
                        {item.rule_variants.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{item.rule_variants.length - 3} more</span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground truncate">Key: {item.key}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant={favoritePoolKeys.includes(item.key) ? "default" : "outline"}
                            className="h-8 w-8"
                            onClick={() => toggleFavoritePoolKey(item.key)}
                            aria-label={favoritePoolKeys.includes(item.key) ? "Remove from favorites" : "Add to favorites"}
                            title={favoritePoolKeys.includes(item.key) ? "Remove favorite" : "Add favorite"}
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                          <Button asChild size="sm" className="h-8">
                            <Link to={createHref} onClick={() => trackCatalogLaunch(item.key)}>Start This Pool</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {safeCatalogPage} of {totalCatalogPages} - {filteredCatalog.length} result(s)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={String(catalogPageSize)} onValueChange={(v) => setCatalogPageSize(Number(v) || 24)}>
                    <SelectTrigger className="h-8 w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">12 / page</SelectItem>
                      <SelectItem value="24">24 / page</SelectItem>
                      <SelectItem value="48">48 / page</SelectItem>
                      <SelectItem value="96">96 / page</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={safeCatalogPage <= 1}
                    onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  {pageWindow.map((p) => (
                    <Button
                      key={`catalog-page-${p}`}
                      size="sm"
                      variant={p === safeCatalogPage ? "default" : "outline"}
                      className="h-8 min-w-8 px-2"
                      onClick={() => setCatalogPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={safeCatalogPage >= totalCatalogPages}
                    onClick={() => setCatalogPage((p) => Math.min(totalCatalogPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
            {poolTypes.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">{poolTypes.length} database-registered template(s)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setShowTable((prev) => !prev)}
                  >
                    {showTable ? "Hide Table View" : "Show Table View"}
                  </Button>
                  <Button asChild size="sm" className="h-9">
                    <Link to="/create-league">Open Create Flow</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Pool Types Table */}
        {(showTable || poolTypes.length === 0 || isLoading) && (
          <div className="bg-card border border-border rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Sport
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Format
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading pool types...</span>
                    </div>
                  </td>
                </tr>
              ) : poolTypes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <p className="text-center text-sm text-muted-foreground">
                      No pool types defined yet. Create your first pool type to get started.
                    </p>
                  </td>
                </tr>
              ) : (
                poolTypes.map((poolType) => (
                  <tr
                    key={poolType.id}
                    className={cn(
                      "transition-colors",
                      poolType.status === "deprecated" && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{poolType.name}</p>
                        {poolType.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {poolType.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getSportLabel(poolType.sport_key)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getFormatLabel(poolType.format_key)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono">{poolType.version}</span>
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge status={poolType.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(poolType.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {poolType.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleActivate(poolType)}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openVersionDialog(poolType)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Create New Version
                          </DropdownMenuItem>
                          {poolType.status !== "deprecated" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedPoolType(poolType);
                                  setIsDeprecateOpen(true);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Deprecate
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-col items-start gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-2">
            <AdminStatusBadge status="draft" />
            <span>Not yet available for pool creation</span>
          </div>
          <div className="flex items-center gap-2">
            <AdminStatusBadge status="active" />
            <span>Available for new pools</span>
          </div>
          <div className="flex items-center gap-2">
            <AdminStatusBadge status="deprecated" />
            <span>No longer available for new pools</span>
          </div>
        </div>
      </div>

      {/* Create Pool Type Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Pool Type</DialogTitle>
            <DialogDescription>
              Define a new pool type template. Pool admins can create pools based on active pool types.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., NFL Survivor Classic"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sport</Label>
                <Select
                  value={formData.sport_key}
                  onValueChange={(value) => setFormData({ ...formData, sport_key: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORTS.map((sport) => (
                      <SelectItem key={sport.key} value={sport.key}>
                        {sport.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={formData.format_key}
                  onValueChange={(value) => setFormData({ ...formData, format_key: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((format) => (
                      <SelectItem key={format.key} value={format.key}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief description for pool admins"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Allowed Settings for Pool Admins</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select which settings pool admins can configure when creating pools of this type.
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-secondary/30 rounded-lg">
                {ALLOWED_SETTINGS_OPTIONS.map((option) => (
                  <label
                    key={option.key}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={formData.allowed_settings.includes(option.key)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData({
                            ...formData,
                            allowed_settings: [...formData.allowed_settings, option.key],
                          });
                        } else {
                          setFormData({
                            ...formData,
                            allowed_settings: formData.allowed_settings.filter(
                              (k) => k !== option.key
                            ),
                          });
                        }
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isSaving || !formData.name || !formData.sport_key || !formData.format_key}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Pool Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version Pool Type Dialog */}
      <Dialog open={isVersionOpen} onOpenChange={setIsVersionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Version</DialogTitle>
            <DialogDescription>
              Create a new version of "{selectedPoolType?.name}". The current version is{" "}
              {selectedPoolType?.version}. Existing pools will continue using their original version.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-secondary/50 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Sport:</span>{" "}
                  {selectedPoolType && getSportLabel(selectedPoolType.sport_key)}
                </div>
                <div>
                  <span className="text-muted-foreground">Format:</span>{" "}
                  {selectedPoolType && getFormatLabel(selectedPoolType.format_key)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="version-description">Description</Label>
              <Input
                id="version-description"
                placeholder="Updated description (optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Allowed Settings</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-secondary/30 rounded-lg">
                {ALLOWED_SETTINGS_OPTIONS.map((option) => (
                  <label
                    key={option.key}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={formData.allowed_settings.includes(option.key)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData({
                            ...formData,
                            allowed_settings: [...formData.allowed_settings, option.key],
                          });
                        } else {
                          setFormData({
                            ...formData,
                            allowed_settings: formData.allowed_settings.filter(
                              (k) => k !== option.key
                            ),
                          });
                        }
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVersionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleVersion} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deprecate Confirmation Dialog */}
      <AlertDialog open={isDeprecateOpen} onOpenChange={setIsDeprecateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deprecate Pool Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deprecate "{selectedPoolType?.name}" ({selectedPoolType?.version})?
              <br /><br />
              Deprecated pool types cannot be used to create new pools. Existing pools using this 
              type will continue to function normally.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeprecate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Deprecate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
