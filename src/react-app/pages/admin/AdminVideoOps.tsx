import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoAuth } from "@/react-app/contexts/DemoAuthContext";

type TabId = "studio" | "queue" | "pipeline" | "publishing" | "recovery" | "settings";
type VideoStatus = "pending" | "queued" | "submitted" | "completed" | "failed" | "retry_pending";
type StudioState = "Draft" | "Processing" | "Needs Review" | "Approved" | "Scheduled" | "Published" | "Failed" | "Held";
type ContentLane = "game_content" | "betting_intelligence" | "watchboard_live";
type ContentType = "game_preview" | "sharp_money" | "edges" | "line_movement" | "prop_watch" | "market_insight" | "live_alert";

interface VideoOpsSummary {
  totals: { all: number; queued: number; submitted: number; completed: number; failed: number };
  social: { notRequested: number; queued: number; published: number; failed: number };
  rolling24h: { all: number; completed: number; failed: number };
  todaySlate: { totalGames: number; withVideoJobs: number; missingVideos: number };
}
interface AdminVideoJob {
  id: string;
  gameId: string;
  status: "queued" | "submitted" | "completed" | "failed";
  socialStatus?: "not_requested" | "queued" | "published" | "failed";
  reviewStatus?: "pending_review" | "approved" | "rejected";
  createdAt: string;
  errorMessage?: string | null;
}
interface PipelineConfig {
  enabled?: string;
  shadow_mode?: string;
  daily_max_videos?: string;
  enabled_sports?: string;
  platform_instagram_enabled?: string;
  platform_facebook_enabled?: string;
  platform_tiktok_enabled?: string;
  approval_required_before_publish?: string;
  retry_limit?: string;
}
interface PipelineHealth {
  missingEnv?: string[];
  today?: {
    featuredItems: number;
    videosReady: number;
    videosPending: number;
    socialsPublished: number;
    socialsFailed: number;
  };
}
interface FeaturedItem {
  itemId: string;
  dateKey: string;
  lane?: ContentLane;
  contentType?: ContentType;
  sport: string;
  gameId: string;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  headline: string;
  shortSummary: string;
  fullText?: string;
  fullAnalysisText: string;
  videoScript: string;
  approvalStatus?: "needs_review" | "approved" | "rejected" | "held";
  publishDestinations?: string[];
  publishStatus: string;
  videoStatus: VideoStatus;
  videoUrl?: string | null;
  socialStatusInstagram: string;
  socialStatusFacebook: string;
  socialStatusTiktok: string;
  metadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
}
interface UndoToast {
  id: string;
  message: string;
  undoAction: (() => Promise<void>) | null;
}
interface SavedFilterPreset {
  tab: TabId;
  laneFilter: string;
  contentTypeFilter: string;
  sportFilter: string;
  statusFilter: string;
  platformFilter: string;
  approvalFilter: string;
}

const REFRESH_MS = 30000;
const VIDEO_STUDIO_PREFS_KEY = "coachg_video_studio_prefs_v1";
const VIDEO_STUDIO_PRESETS_KEY = "coachg_video_studio_filter_presets_v1";
const VIDEO_STUDIO_LANE_DESTINATIONS_KEY = "coachg_video_studio_lane_destinations_v1";
const DEFAULT_FILTER_PRESETS: Record<string, SavedFilterPreset> = {
  "Review Shift": {
    tab: "studio",
    laneFilter: "all",
    contentTypeFilter: "all",
    sportFilter: "all",
    statusFilter: "Needs Review",
    platformFilter: "all",
    approvalFilter: "needs_review",
  },
  "Publishing QA": {
    tab: "publishing",
    laneFilter: "all",
    contentTypeFilter: "all",
    sportFilter: "all",
    statusFilter: "Approved",
    platformFilter: "all",
    approvalFilter: "approved",
  },
  "Recovery Mode": {
    tab: "recovery",
    laneFilter: "all",
    contentTypeFilter: "all",
    sportFilter: "all",
    statusFilter: "Failed",
    platformFilter: "all",
    approvalFilter: "all",
  },
};
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "studio", label: "Studio" },
  { id: "queue", label: "Queue" },
  { id: "pipeline", label: "Pipeline" },
  { id: "publishing", label: "Publishing" },
  { id: "recovery", label: "Recovery" },
  { id: "settings", label: "Settings" },
];

const asBool = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};
const parseMeta = (json: string | null | undefined): Record<string, unknown> => {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const approvalState = (item: FeaturedItem): string => item.approvalStatus || String(parseMeta(item.metadataJson).approval_state || "needs_review");
const scheduleState = (item: FeaturedItem): string => String(parseMeta(item.metadataJson).schedule_state || "unscheduled");
const disabledPlatforms = (item: FeaturedItem): string[] => {
  const value = parseMeta(item.metadataJson).disabled_platforms;
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
};
const contentLane = (item: FeaturedItem): ContentLane => {
  if (item.lane) return item.lane;
  const type = item.contentType;
  if (type === "live_alert") return "watchboard_live";
  if (type === "sharp_money" || type === "edges" || type === "line_movement" || type === "prop_watch" || type === "market_insight") {
    return "betting_intelligence";
  }
  return "game_content";
};
const contentType = (item: FeaturedItem): ContentType => item.contentType || "game_preview";
const approvalStatusValue = (item: FeaturedItem): string => approvalState(item);
const laneLabel = (lane: string): string => ({
  game_content: "Game Content",
  betting_intelligence: "Betting Intelligence",
  watchboard_live: "WatchBoard Live",
}[lane] || lane.replace(/_/g, " "));
const contentTypeLabel = (type: string): string => ({
  game_preview: "Game Preview",
  sharp_money: "Sharp Money",
  edges: "Edges",
  line_movement: "Line Movement",
  prop_watch: "Prop Watch",
  market_insight: "Market Insight",
  live_alert: "Live Alert",
}[type] || type.replace(/_/g, " "));
const BASE_LANE_DESTINATIONS: Record<ContentLane, string[]> = {
  game_content: ["game_page", "homepage_featured", "social_optional"],
  betting_intelligence: ["edges_tab", "sharp_money_tab", "line_movement_tab", "prop_watch_tab", "social_optional"],
  watchboard_live: ["watchboard", "live_alerts_feed", "live_game_cards"],
};
const parseDestinationText = (value: string): string[] => (
  value
    .split(",")
    .map((v) => v.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter((v) => v.length > 0)
);
const formatDestinationText = (value: string[]): string => value.join(", ");
const destinationLabel = (value: string): string => value.replace(/_/g, " ");
const laneDestinationDraftsFromMap = (value: Record<ContentLane, string[]>): Record<ContentLane, string> => ({
  game_content: formatDestinationText(value.game_content || []),
  betting_intelligence: formatDestinationText(value.betting_intelligence || []),
  watchboard_live: formatDestinationText(value.watchboard_live || []),
});
const normalizeLaneDestinationMap = (value: unknown): Record<ContentLane, string[]> => {
  const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const game = Array.isArray(obj.game_content) ? obj.game_content.map((v) => String(v)) : BASE_LANE_DESTINATIONS.game_content;
  const betting = Array.isArray(obj.betting_intelligence) ? obj.betting_intelligence.map((v) => String(v)) : BASE_LANE_DESTINATIONS.betting_intelligence;
  const watch = Array.isArray(obj.watchboard_live) ? obj.watchboard_live.map((v) => String(v)) : BASE_LANE_DESTINATIONS.watchboard_live;
  return {
    game_content: game,
    betting_intelligence: betting,
    watchboard_live: watch,
  };
};
const stateClasses: Record<StudioState, string> = {
  Draft: "border-slate-400/40 text-slate-200",
  Processing: "border-cyan-400/40 text-cyan-200",
  "Needs Review": "border-amber-400/40 text-amber-200",
  Approved: "border-emerald-400/40 text-emerald-200",
  Scheduled: "border-violet-400/40 text-violet-200",
  Published: "border-fuchsia-400/40 text-fuchsia-200",
  Failed: "border-rose-400/40 text-rose-200",
  Held: "border-orange-400/40 text-orange-200",
};
const effectiveState = (item: FeaturedItem): StudioState => {
  const approval = approvalState(item);
  const schedule = scheduleState(item);
  if (!item.videoScript) return "Draft";
  if (item.videoStatus === "pending" || item.videoStatus === "queued" || item.videoStatus === "submitted") return "Processing";
  if (item.videoStatus === "failed" || item.videoStatus === "retry_pending") return "Failed";
  if (approval === "held") return "Held";
  if (approval === "rejected") return "Failed";
  if (item.publishStatus === "published_owned") return "Published";
  if (approval === "approved" && schedule === "scheduled") return "Scheduled";
  if (approval === "approved") return "Approved";
  return "Needs Review";
};

export default function AdminVideoOps() {
  const { isDemoMode } = useDemoAuth();
  const [activeTab, setActiveTab] = useState<TabId>("studio");
  const [summary, setSummary] = useState<VideoOpsSummary | null>(null);
  const [jobs, setJobs] = useState<AdminVideoJob[]>([]);
  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig | null>(null);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const [sportsDraft, setSportsDraft] = useState("");
  const [dailyMaxDraft, setDailyMaxDraft] = useState("12");
  const [retryLimitDraft, setRetryLimitDraft] = useState("3");
  const [previewItem, setPreviewItem] = useState<FeaturedItem | null>(null);
  const [denseMode, setDenseMode] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [studioLaneFilter, setStudioLaneFilter] = useState("all");
  const [studioContentTypeFilter, setStudioContentTypeFilter] = useState("all");
  const [studioSportFilter, setStudioSportFilter] = useState("all");
  const [studioStatusFilter, setStudioStatusFilter] = useState("all");
  const [studioPlatformFilter, setStudioPlatformFilter] = useState("all");
  const [studioApprovalFilter, setStudioApprovalFilter] = useState("all");
  const [presetNameDraft, setPresetNameDraft] = useState("");
  const [savedPresets, setSavedPresets] = useState<Record<string, SavedFilterPreset>>({});
  const [laneDestinationDefaults, setLaneDestinationDefaults] = useState<Record<ContentLane, string[]>>(BASE_LANE_DESTINATIONS);
  const [laneDestinationDrafts, setLaneDestinationDrafts] = useState<Record<ContentLane, string>>(laneDestinationDraftsFromMap(BASE_LANE_DESTINATIONS));
  const [laneDestinationImportDraft, setLaneDestinationImportDraft] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIDEO_STUDIO_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        activeTab?: TabId;
        denseMode?: boolean;
        laneFilter?: string;
        contentTypeFilter?: string;
        sportFilter?: string;
        statusFilter?: string;
        platformFilter?: string;
        approvalFilter?: string;
      };
      if (parsed.activeTab && TABS.some((tab) => tab.id === parsed.activeTab)) setActiveTab(parsed.activeTab);
      if (typeof parsed.denseMode === "boolean") setDenseMode(parsed.denseMode);
      if (typeof parsed.laneFilter === "string") setStudioLaneFilter(parsed.laneFilter);
      if (typeof parsed.contentTypeFilter === "string") setStudioContentTypeFilter(parsed.contentTypeFilter);
      if (typeof parsed.sportFilter === "string") setStudioSportFilter(parsed.sportFilter);
      if (typeof parsed.statusFilter === "string") setStudioStatusFilter(parsed.statusFilter);
      if (typeof parsed.platformFilter === "string") setStudioPlatformFilter(parsed.platformFilter);
      if (typeof parsed.approvalFilter === "string") setStudioApprovalFilter(parsed.approvalFilter);
    } catch {
      // Ignore invalid local preference state
    }
  }, []);

  useEffect(() => {
    try {
      const payload = {
        activeTab,
        denseMode,
        laneFilter: studioLaneFilter,
        contentTypeFilter: studioContentTypeFilter,
        sportFilter: studioSportFilter,
        statusFilter: studioStatusFilter,
        platformFilter: studioPlatformFilter,
        approvalFilter: studioApprovalFilter,
      };
      window.localStorage.setItem(VIDEO_STUDIO_PREFS_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors (private mode / quota)
    }
  }, [activeTab, denseMode, studioApprovalFilter, studioContentTypeFilter, studioLaneFilter, studioPlatformFilter, studioSportFilter, studioStatusFilter]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIDEO_STUDIO_PRESETS_KEY);
      if (!raw) {
        setSavedPresets(DEFAULT_FILTER_PRESETS);
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, SavedFilterPreset>;
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        setSavedPresets(parsed);
        return;
      }
      setSavedPresets(DEFAULT_FILTER_PRESETS);
    } catch {
      setSavedPresets(DEFAULT_FILTER_PRESETS);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIDEO_STUDIO_PRESETS_KEY, JSON.stringify(savedPresets));
    } catch {
      // Ignore storage errors
    }
  }, [savedPresets]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIDEO_STUDIO_LANE_DESTINATIONS_KEY);
      if (!raw) return;
      const parsed = normalizeLaneDestinationMap(JSON.parse(raw));
      setLaneDestinationDefaults(parsed);
      setLaneDestinationDrafts(laneDestinationDraftsFromMap(parsed));
    } catch {
      // Ignore invalid lane destination map
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIDEO_STUDIO_LANE_DESTINATIONS_KEY, JSON.stringify(laneDestinationDefaults));
    } catch {
      // Ignore storage errors
    }
  }, [laneDestinationDefaults, pushUndoToast]);

  useEffect(() => {
    setLaneDestinationImportDraft(JSON.stringify(laneDestinationDefaults, null, 2));
  }, [laneDestinationDefaults]);

  const requestHeaders = useMemo<Headers>(() => {
    const headers = new Headers();
    if (isDemoMode) headers.set("X-Demo-Mode", "true");
    return headers;
  }, [isDemoMode]);

  const load = useCallback(async () => {
    try {
      const [summaryRes, jobsRes, featuredRes, configRes, healthRes] = await Promise.all([
        fetch("/api/coachg/admin/video-ops/summary", { credentials: "include", headers: requestHeaders }),
        fetch("/api/coachg/admin/video/jobs?limit=200", { credentials: "include", headers: requestHeaders }),
        fetch("/api/coachg/admin/featured?limit=200", { credentials: "include", headers: requestHeaders }),
        fetch("/api/coachg/admin/pipeline/config", { credentials: "include", headers: requestHeaders }),
        fetch("/api/coachg/admin/pipeline/health", { credentials: "include", headers: requestHeaders }),
      ]);
      if (!summaryRes.ok) throw new Error(`Summary HTTP ${summaryRes.status}`);
      const summaryPayload = await summaryRes.json() as { summary?: VideoOpsSummary };
      const jobsPayload = jobsRes.ok ? await jobsRes.json() as { jobs?: AdminVideoJob[] } : { jobs: [] };
      const featuredPayload = featuredRes.ok ? await featuredRes.json() as { items?: FeaturedItem[] } : { items: [] };
      const configPayload = configRes.ok ? await configRes.json() as { config?: PipelineConfig } : { config: {} };
      const healthPayload = healthRes.ok ? await healthRes.json() as { health?: PipelineHealth } : { health: {} };
      setSummary(summaryPayload.summary || null);
      setJobs(Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : []);
      setFeaturedItems(Array.isArray(featuredPayload.items) ? featuredPayload.items : []);
      setPipelineConfig(configPayload.config || {});
      setPipelineHealth(healthPayload.health || {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [requestHeaders]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (pipelineConfig?.enabled_sports) setSportsDraft(pipelineConfig.enabled_sports);
    if (pipelineConfig?.daily_max_videos) setDailyMaxDraft(pipelineConfig.daily_max_videos);
    setRetryLimitDraft(pipelineConfig?.retry_limit || "3");
  }, [pipelineConfig]);

  const callJson = useCallback(async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(requestHeaders);
    if (init.body) headers.set("Content-Type", "application/json");
    const res = await fetch(url, { credentials: "include", ...init, headers });
    if (!res.ok) throw new Error(`${init.method || "GET"} ${url} failed (${res.status})`);
    return res.json().catch(() => ({}));
  }, [requestHeaders]);

  const applyPreset = useCallback((preset: SavedFilterPreset) => {
    setActiveTab(preset.tab);
    setStudioLaneFilter(preset.laneFilter || "all");
    setStudioContentTypeFilter(preset.contentTypeFilter || "all");
    setStudioSportFilter(preset.sportFilter);
    setStudioStatusFilter(preset.statusFilter);
    setStudioPlatformFilter(preset.platformFilter);
    setStudioApprovalFilter(preset.approvalFilter);
  }, []);

  const saveCurrentAsPreset = useCallback((name: string) => {
    const key = name.trim();
    if (!key) return;
    setSavedPresets((prev) => ({
      ...prev,
      [key]: {
        tab: activeTab,
          laneFilter: studioLaneFilter,
          contentTypeFilter: studioContentTypeFilter,
        sportFilter: studioSportFilter,
        statusFilter: studioStatusFilter,
        platformFilter: studioPlatformFilter,
        approvalFilter: studioApprovalFilter,
      },
    }));
    setPresetNameDraft("");
    }, [activeTab, studioApprovalFilter, studioContentTypeFilter, studioLaneFilter, studioPlatformFilter, studioSportFilter, studioStatusFilter]);

  const deletePreset = useCallback((name: string) => {
    setSavedPresets((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const publishDestinations = useCallback((item: FeaturedItem): string[] => {
    if (Array.isArray(item.publishDestinations) && item.publishDestinations.length > 0) return item.publishDestinations;
    return laneDestinationDefaults[contentLane(item)] || [];
  }, [laneDestinationDefaults]);

  const saveLaneDestinations = useCallback((lane: ContentLane) => {
    const draft = laneDestinationDrafts[lane] || "";
    const next = parseDestinationText(draft);
    if (next.length === 0) {
      setError("Lane destinations cannot be empty.");
      return;
    }
    const previous = laneDestinationDefaults[lane] || [];
    setLaneDestinationDefaults((prev) => ({ ...prev, [lane]: next }));
    pushUndoToast(`${laneLabel(lane)} destinations updated`, async () => {
      setLaneDestinationDefaults((prev) => ({ ...prev, [lane]: previous }));
      setLaneDestinationDrafts((prev) => ({ ...prev, [lane]: formatDestinationText(previous) }));
    });
    setError(null);
  }, [laneDestinationDefaults, laneDestinationDrafts, pushUndoToast]);

  const resetLaneDestinations = useCallback(() => {
    setLaneDestinationDefaults(BASE_LANE_DESTINATIONS);
    setLaneDestinationDrafts(laneDestinationDraftsFromMap(BASE_LANE_DESTINATIONS));
    setError(null);
  }, []);

  const copyLaneDestinationsJson = useCallback(async () => {
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(JSON.stringify(laneDestinationDefaults, null, 2));
      pushUndoToast("Lane destination matrix copied.", null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy matrix JSON.");
    }
  }, [laneDestinationDefaults]);

  const importLaneDestinationsJson = useCallback(() => {
    try {
      const raw = laneDestinationImportDraft.trim();
      if (!raw) {
        setError("Import JSON cannot be empty.");
        return;
      }
      const parsed = normalizeLaneDestinationMap(JSON.parse(raw));
      if (
        parsed.game_content.length === 0
        || parsed.betting_intelligence.length === 0
        || parsed.watchboard_live.length === 0
      ) {
        setError("Each lane must include at least one destination.");
        return;
      }
      const previous = laneDestinationDefaults;
      setLaneDestinationDefaults(parsed);
      setLaneDestinationDrafts(laneDestinationDraftsFromMap(parsed));
      pushUndoToast("Lane destination matrix imported.", async () => {
        setLaneDestinationDefaults(previous);
        setLaneDestinationDrafts(laneDestinationDraftsFromMap(previous));
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid matrix JSON.");
    }
  }, [laneDestinationDefaults, laneDestinationImportDraft, pushUndoToast]);

  const runPipeline = useCallback(async () => {
    setRunningPipeline(true);
    try {
      await callJson("/api/coachg/admin/pipeline/run", { method: "POST", body: JSON.stringify({ force: true }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningPipeline(false);
    }
  }, [callJson, load]);

  const updateConfig = useCallback(async (updates: Record<string, string>) => {
    try {
      await callJson("/api/coachg/admin/pipeline/config", { method: "PUT", body: JSON.stringify(updates) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, load]);

  const setApproval = useCallback(async (
    itemId: string,
    state: "approved" | "rejected" | "held" | "needs_review",
    previousState?: string
  ) => {
    try {
      await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/approval`, { method: "POST", body: JSON.stringify({ state }) });
      if (previousState && previousState !== state) {
        pushUndoToast(`Approval changed to ${state}`, async () => {
          await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/approval`, {
            method: "POST",
            body: JSON.stringify({ state: previousState }),
          });
          await load();
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, load, pushUndoToast]);

  const retryVideo = useCallback(async (itemId: string) => {
    try {
      await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/retry-video`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, load]);

  const retrySocial = useCallback(async (itemId: string) => {
    try {
      await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/retry-social?force=1`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, load]);

  const publishNow = useCallback(async (itemId: string) => {
    try {
      await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/publish-now`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, load]);

  const saveScript = useCallback(async (itemId: string) => {
    try {
      await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/script`, { method: "PUT", body: JSON.stringify({ video_script: scriptDraft }) });
      setEditingItemId(null);
      setScriptDraft("");
      await retryVideo(itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, retryVideo, scriptDraft]);

  const closeEditor = useCallback(() => {
    setEditingItemId(null);
    setScriptDraft("");
  }, []);

  function pushUndoToast(message: string, undoAction: (() => Promise<void>) | null): void {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setUndoToast({ id, message, undoAction });
  }

  useEffect(() => {
    if (!undoToast) return;
    const timer = setTimeout(() => setUndoToast((current) => (current?.id === undoToast.id ? null : current)), 8000);
    return () => clearTimeout(timer);
  }, [undoToast]);

  const scheduleItem = useCallback(async (itemId: string, scheduledFor: string | null, previousSchedule?: string | null) => {
    try {
      await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/schedule`, { method: "POST", body: JSON.stringify({ scheduled_for: scheduledFor }) });
      pushUndoToast(scheduledFor ? "Item scheduled" : "Schedule canceled", async () => {
        await callJson(`/api/coachg/admin/featured/${encodeURIComponent(itemId)}/schedule`, {
          method: "POST",
          body: JSON.stringify({ scheduled_for: previousSchedule ?? null }),
        });
        await load();
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, load, pushUndoToast]);

  const setPlatformDisabled = useCallback(async (item: FeaturedItem, platform: "instagram" | "facebook" | "tiktok") => {
    const disabled = disabledPlatforms(item);
    const next = disabled.includes(platform) ? disabled.filter((p) => p !== platform) : [...disabled, platform];
    try {
      await callJson(`/api/coachg/admin/featured/${encodeURIComponent(item.itemId)}/platforms`, { method: "POST", body: JSON.stringify({ disabled_platforms: next }) });
      pushUndoToast(`${platform.toUpperCase()} ${next.includes(platform) ? "disabled" : "enabled"}`, async () => {
        await callJson(`/api/coachg/admin/featured/${encodeURIComponent(item.itemId)}/platforms`, {
          method: "POST",
          body: JSON.stringify({ disabled_platforms: disabled }),
        });
        await load();
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [callJson, load, pushUndoToast]);

  const bulkRun = useCallback(async (op: "approve" | "regenerate" | "publish" | "retry") => {
    try {
      for (const id of selectedIds) {
        if (op === "approve") {
          const existing = featuredItems.find((item) => item.itemId === id);
          await setApproval(id, "approved", existing ? approvalStatusValue(existing) : undefined);
        }
        if (op === "regenerate") await retryVideo(id);
        if (op === "publish") await publishNow(id);
        if (op === "retry") {
          await retryVideo(id);
          await retrySocial(id);
        }
      }
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [featuredItems, publishNow, retrySocial, retryVideo, selectedIds, setApproval]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || target?.isContentEditable;
      if (typing) return;

      if (event.altKey && /^[1-6]$/.test(event.key)) {
        const idx = Number(event.key) - 1;
        const next = TABS[idx]?.id;
        if (next) {
          event.preventDefault();
          setActiveTab(next);
        }
        return;
      }

      if (event.key === "Escape") {
        setPreviewItem(null);
        closeEditor();
        return;
      }

      if (event.key.toLowerCase() === "d") {
        setDenseMode((v) => !v);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShowHotkeys((v) => !v);
        return;
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        void runPipeline();
        return;
      }
      if (selectedIds.length > 0 && event.key.toLowerCase() === "a") {
        event.preventDefault();
        void bulkRun("approve");
        return;
      }
      if (selectedIds.length > 0 && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void bulkRun("regenerate");
        return;
      }
      if (selectedIds.length > 0 && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void bulkRun("publish");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bulkRun, closeEditor, runPipeline, selectedIds.length]);

  useEffect(() => {
    if (!previewItem) return;
    const onModalKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        void setApproval(previewItem.itemId, "approved", approvalStatusValue(previewItem));
      } else if (key === "e") {
        event.preventDefault();
        setEditingItemId(previewItem.itemId);
        setScriptDraft(previewItem.videoScript);
        setActiveTab("studio");
        setPreviewItem(null);
      } else if (key === "r") {
        event.preventDefault();
        void retryVideo(previewItem.itemId);
      } else if (key === "x") {
        event.preventDefault();
        void setApproval(previewItem.itemId, "rejected", approvalStatusValue(previewItem));
      } else if (key === "s") {
        event.preventDefault();
        void publishNow(previewItem.itemId);
      }
    };
    window.addEventListener("keydown", onModalKeyDown);
    return () => window.removeEventListener("keydown", onModalKeyDown);
  }, [previewItem, publishNow, retryVideo, setApproval]);

  const jobsByGame = useMemo(() => {
    const map = new Map<string, AdminVideoJob[]>();
    for (const job of jobs) {
      const list = map.get(job.gameId) || [];
      list.push(job);
      map.set(job.gameId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return map;
  }, [jobs]);

  const studioItems = useMemo(() => featuredItems.filter((item) => {
    if (studioLaneFilter !== "all" && contentLane(item) !== studioLaneFilter) return false;
    if (studioContentTypeFilter !== "all" && contentType(item) !== studioContentTypeFilter) return false;
    if (studioSportFilter !== "all" && item.sport !== studioSportFilter) return false;
    if (studioStatusFilter !== "all" && effectiveState(item) !== studioStatusFilter) return false;
    if (studioApprovalFilter !== "all" && approvalStatusValue(item) !== studioApprovalFilter) return false;
    if (studioPlatformFilter !== "all") {
      const map: Record<string, string> = { instagram: item.socialStatusInstagram, facebook: item.socialStatusFacebook, tiktok: item.socialStatusTiktok };
      if (map[studioPlatformFilter] !== "published") return false;
    }
    return true;
  }), [featuredItems, studioApprovalFilter, studioContentTypeFilter, studioLaneFilter, studioPlatformFilter, studioSportFilter, studioStatusFilter]);

  const readyForReviewItems = useMemo(() => studioItems.filter((i) => effectiveState(i) === "Needs Review"), [studioItems]);
  const needsAttentionItems = useMemo(() => studioItems.filter((i) => ["Failed", "Held"].includes(effectiveState(i))), [studioItems]);
  const approvedItems = useMemo(() => studioItems.filter((i) => ["Approved", "Scheduled"].includes(effectiveState(i))), [studioItems]);
  const publishedItems = useMemo(() => studioItems.filter((i) => effectiveState(i) === "Published"), [studioItems]);

  const toggleSectionSelection = useCallback((items: FeaturedItem[], select: boolean) => {
    const ids = items.map((item) => item.itemId);
    setSelectedIds((prev) => {
      if (select) {
        return Array.from(new Set([...prev, ...ids]));
      }
      return prev.filter((id) => !ids.includes(id));
    });
  }, []);

  const queueBuckets = useMemo(() => {
    const buckets: Record<string, FeaturedItem[]> = {
      pending_script_generation: [],
      pending_video_generation: [],
      pending_review: [],
      approved: [],
      scheduled: [],
      published: [],
      failed: [],
    };
    for (const item of featuredItems) {
      const state = effectiveState(item);
      if (state === "Draft") buckets.pending_script_generation.push(item);
      else if (state === "Processing") buckets.pending_video_generation.push(item);
      else if (state === "Needs Review") buckets.pending_review.push(item);
      else if (state === "Approved") buckets.approved.push(item);
      else if (state === "Scheduled") buckets.scheduled.push(item);
      else if (state === "Published") buckets.published.push(item);
      else if (state === "Failed" || state === "Held") buckets.failed.push(item);
    }
    return buckets;
  }, [featuredItems]);

  const recoveryItems = useMemo(() => featuredItems.filter((item) => {
    const state = effectiveState(item);
    return state === "Failed" || state === "Held"
      || item.socialStatusInstagram === "failed"
      || item.socialStatusFacebook === "failed"
      || item.socialStatusTiktok === "failed";
  }), [featuredItems]);

  const publishingQueue = useMemo(() => featuredItems.filter((item) => {
    const state = effectiveState(item);
    return state === "Approved" || state === "Scheduled" || state === "Published";
  }), [featuredItems]);

  const kpis = useMemo(() => ({
    review: featuredItems.filter((i) => effectiveState(i) === "Needs Review").length,
    attention: featuredItems.filter((i) => ["Failed", "Held"].includes(effectiveState(i))).length,
    approved: featuredItems.filter((i) => ["Approved", "Scheduled"].includes(effectiveState(i))).length,
    published: featuredItems.filter((i) => effectiveState(i) === "Published").length,
  }), [featuredItems]);

  const badge = (state: StudioState) => (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateClasses[state]}`}>{state}</span>
  );

  const renderStudioCard = (item: FeaturedItem) => {
    const selected = selectedIds.includes(item.itemId);
    const state = effectiveState(item);
    const approval = approvalStatusValue(item);
    const lane = contentLane(item);
    const cType = contentType(item);
    const destinations = publishDestinations(item);
    const gameJobs = jobsByGame.get(item.gameId) || [];
    const latestJob = gameJobs[0];
    const disabled = disabledPlatforms(item);
    return (
      <div key={item.itemId} className={`rounded-xl border border-white/10 bg-black/25 ${denseMode ? "p-3" : "p-4"}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase text-cyan-200">{laneLabel(lane)}</span>
              <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">{contentTypeLabel(cType)}</span>
              <span className="text-[11px] uppercase text-cyan-300">{item.sport}</span>
            </div>
            <h3 className={`${denseMode ? "text-xs" : "text-sm"} font-semibold text-white`}>{item.awayTeam || "Away"} @ {item.homeTeam || "Home"}</h3>
            <p className={`${denseMode ? "text-[11px]" : "text-xs"} text-white/70`}>{item.headline}</p>
          </div>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => setSelectedIds((prev) => (e.target.checked ? [...prev, item.itemId] : prev.filter((id) => id !== item.itemId)))}
          />
        </div>

        <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/40">
          {item.videoUrl ? (
            <video src={item.videoUrl} className={`${denseMode ? "h-24" : "h-32"} w-full object-cover`} muted playsInline preload="metadata" />
          ) : (
            <div className={`flex ${denseMode ? "h-24" : "h-32"} items-center justify-center bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-violet-500/15 text-[11px] text-white/70`}>
              Thumbnail pending
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {badge(state)}
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-white/80">IG {item.socialStatusInstagram}</span>
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-white/80">FB {item.socialStatusFacebook}</span>
          <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-white/80">TT {item.socialStatusTiktok}</span>
        </div>

        <details className={`mt-2 rounded-md border border-white/10 bg-white/[0.02] ${denseMode ? "p-1.5" : "p-2"}`}>
          <summary className="cursor-pointer text-xs font-semibold text-cyan-200">Script Preview</summary>
          <p className={`mt-2 ${denseMode ? "max-h-16 text-[11px]" : "max-h-24 text-xs"} overflow-y-auto whitespace-pre-wrap text-white/75`}>{item.videoScript}</p>
        </details>
        <details className={`mt-2 rounded-md border border-white/10 bg-white/[0.02] ${denseMode ? "p-1.5" : "p-2"}`}>
          <summary className="cursor-pointer text-xs font-semibold text-cyan-200">Article Preview</summary>
          <p className={`mt-2 ${denseMode ? "max-h-16 text-[11px]" : "max-h-24 text-xs"} overflow-y-auto whitespace-pre-wrap text-white/75`}>
            {item.fullText || item.fullAnalysisText || item.shortSummary || "No article text available."}
          </p>
        </details>

        <p className="mt-2 text-[11px] text-white/60">
          {latestJob ? `Generation ${latestJob.status} • ${new Date(latestJob.createdAt).toLocaleString()}` : "No generation job recorded yet"}
          {latestJob?.errorMessage ? ` • ${latestJob.errorMessage}` : ""}
        </p>

        {editingItemId === item.itemId ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={scriptDraft}
              onChange={(e) => setScriptDraft(e.target.value)}
              className="h-28 w-full rounded-md border border-white/15 bg-black/40 p-2 text-xs text-white outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveScript(item.itemId)} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">Save + Regenerate</button>
              <button type="button" onClick={() => setEditingItemId(null)} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPreviewItem(item)} className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/90">Preview Video</button>
            <button type="button" onClick={() => { setEditingItemId(item.itemId); setScriptDraft(item.videoScript); }} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Edit Script</button>
            <button type="button" onClick={() => void retryVideo(item.itemId)} className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">Regenerate Video</button>
            <button type="button" onClick={() => void setApproval(item.itemId, "approved", approval)} className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-100">Approve</button>
            <button type="button" onClick={() => void setApproval(item.itemId, "rejected", approval)} className="rounded-md border border-rose-400/30 bg-rose-500/15 px-2 py-1 text-[11px] text-rose-100">Reject</button>
            <button type="button" onClick={() => void setApproval(item.itemId, "held", approval)} className="rounded-md border border-fuchsia-400/30 bg-fuchsia-500/15 px-2 py-1 text-[11px] text-fuchsia-100">Hold</button>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" onClick={() => void setPlatformDisabled(item, "instagram")} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">
            IG {disabled.includes("instagram") ? "off" : "on"}
          </button>
          <button type="button" onClick={() => void setPlatformDisabled(item, "facebook")} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">
            FB {disabled.includes("facebook") ? "off" : "on"}
          </button>
          <button type="button" onClick={() => void setPlatformDisabled(item, "tiktok")} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">
            TT {disabled.includes("tiktok") ? "off" : "on"}
          </button>
          <span className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70">Approval: {approval}</span>
          <span className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70">Destinations: {destinations.map((d) => d.replace(/_/g, " ")).join(", ")}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 p-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-violet-500/10 p-5">
        <h1 className="text-2xl font-bold text-white">Coach G Video Studio</h1>
        <p className="mt-1 text-sm text-white/70">Professional media operations command center.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-[10px] text-white/60">Ready for Review</p><p className="text-sm font-semibold text-cyan-200">{kpis.review}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-[10px] text-white/60">Needs Attention</p><p className="text-sm font-semibold text-rose-200">{kpis.attention}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-[10px] text-white/60">Approved</p><p className="text-sm font-semibold text-emerald-200">{kpis.approved}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-[10px] text-white/60">Published Today</p><p className="text-sm font-semibold text-fuchsia-200">{kpis.published}</p></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${activeTab === tab.id ? "border-cyan-400/40 bg-cyan-500/20 text-cyan-100" : "border-white/15 bg-black/20 text-white/75"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="sticky top-2 z-30 rounded-xl border border-white/10 bg-[#071022]/90 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runPipeline()} disabled={runningPipeline} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">
            {runningPipeline ? "Running..." : "Run Pipeline"}
          </button>
          <button type="button" onClick={() => setDenseMode((v) => !v)} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/85">
            {denseMode ? "Comfort mode" : "Dense mode"}
          </button>
          <button type="button" onClick={() => setShowHotkeys((v) => !v)} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/85">
            {showHotkeys ? "Hide shortcuts" : "Show shortcuts"}
          </button>
          <span className="text-[11px] text-white/60">Selected {selectedIds.length}</span>
          <span className="text-[11px] text-white/50">Quick keys: Alt+1..6 tabs, G run, A approve, R regenerate, P publish, D density, ? help</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={presetNameDraft}
            onChange={(e) => setPresetNameDraft(e.target.value)}
            placeholder="Save preset name"
            className="w-44 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-white"
          />
          <button
            type="button"
            onClick={() => saveCurrentAsPreset(presetNameDraft)}
            className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100"
          >
            Save Preset
          </button>
          {Object.entries(savedPresets).slice(0, 8).map(([name, preset]) => (
            <div key={name} className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-1.5 py-1">
              <button type="button" onClick={() => applyPreset(preset)} className="text-[11px] text-white/85">{name}</button>
              <button type="button" onClick={() => deletePreset(name)} className="text-[11px] text-rose-300">x</button>
            </div>
          ))}
        </div>
        {showHotkeys && (
          <div className="mt-2 rounded-md border border-white/10 bg-black/30 p-2 text-[11px] text-white/70">
            <p>`A` approve selection • `R` regenerate selection • `P` publish selection • `Escape` close modal/editor</p>
            <p>In preview modal: `A` approve, `E` edit, `R` regenerate, `X` reject, `S` send to queue.</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {loading && <p className="text-sm text-white/60">Loading Video Studio...</p>}

      {activeTab === "studio" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-cyan-200">Filters</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <select value={studioLaneFilter} onChange={(e) => setStudioLaneFilter(e.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white">
                <option value="all">All Lanes</option>
                <option value="game_content">Game Content</option>
                <option value="betting_intelligence">Betting Intelligence</option>
                <option value="watchboard_live">WatchBoard Live</option>
              </select>
              <select value={studioContentTypeFilter} onChange={(e) => setStudioContentTypeFilter(e.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white">
                <option value="all">All Content Types</option>
                <option value="game_preview">Game Preview</option>
                <option value="sharp_money">Sharp Money</option>
                <option value="edges">Edges</option>
                <option value="line_movement">Line Movement</option>
                <option value="prop_watch">Prop Watch</option>
                <option value="market_insight">Market Insight</option>
                <option value="live_alert">Live Alert</option>
              </select>
              <select value={studioSportFilter} onChange={(e) => setStudioSportFilter(e.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white">
                <option value="all">All Sports</option>
                {Array.from(new Set(featuredItems.map((i) => i.sport))).map((sport) => <option key={sport} value={sport}>{sport.toUpperCase()}</option>)}
              </select>
              <select value={studioStatusFilter} onChange={(e) => setStudioStatusFilter(e.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white">
                <option value="all">All States</option>
                {(["Draft", "Processing", "Needs Review", "Approved", "Scheduled", "Published", "Failed", "Held"] as StudioState[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={studioPlatformFilter} onChange={(e) => setStudioPlatformFilter(e.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white">
                <option value="all">All Platforms</option>
                <option value="instagram">Instagram Published</option>
                <option value="facebook">Facebook Published</option>
                <option value="tiktok">TikTok Published</option>
              </select>
              <select value={studioApprovalFilter} onChange={(e) => setStudioApprovalFilter(e.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white">
                <option value="all">All Approval</option>
                {["needs_review", "approved", "rejected", "held"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-cyan-200">Bulk Actions</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void bulkRun("approve")} className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-100">Approve Selected</button>
              <button type="button" onClick={() => void bulkRun("regenerate")} className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">Regenerate Selected</button>
              <button type="button" onClick={() => void bulkRun("publish")} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">Publish Selected</button>
              <button type="button" onClick={() => void bulkRun("retry")} className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[11px] text-violet-100">Retry Selected</button>
              <p className="self-center text-[11px] text-white/60">{selectedIds.length} selected</p>
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Ready for Review</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => toggleSectionSelection(readyForReviewItems, true)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Select all</button>
                <button type="button" onClick={() => toggleSectionSelection(readyForReviewItems, false)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Clear</button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">{readyForReviewItems.map(renderStudioCard)}</div>
          </section>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Needs Attention</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => toggleSectionSelection(needsAttentionItems, true)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Select all</button>
                <button type="button" onClick={() => toggleSectionSelection(needsAttentionItems, false)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Clear</button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">{needsAttentionItems.map(renderStudioCard)}</div>
          </section>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Approved for Publishing</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => toggleSectionSelection(approvedItems, true)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Select all</button>
                <button type="button" onClick={() => toggleSectionSelection(approvedItems, false)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Clear</button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">{approvedItems.map(renderStudioCard)}</div>
          </section>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Published Today</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => toggleSectionSelection(publishedItems, true)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Select all</button>
                <button type="button" onClick={() => toggleSectionSelection(publishedItems, false)} className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/80">Clear</button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">{publishedItems.map(renderStudioCard)}</div>
          </section>
        </div>
      )}

      {activeTab === "queue" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(queueBuckets).map(([key, items]) => (
            <div key={key} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-sm font-semibold text-cyan-200">{key.replace(/_/g, " ")}</h3>
              <p className="text-xs text-white/50">{items.length} items</p>
              <div className="mt-2 space-y-2">
                {items.slice(0, 12).map((item) => {
                  const failedCount = (jobsByGame.get(item.gameId) || []).filter((j) => j.status === "failed").length;
                  const latestFailed = (jobsByGame.get(item.gameId) || []).find((j) => j.status === "failed" && j.errorMessage);
                  return (
                    <div key={item.itemId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <p className="text-xs text-white/85">{item.sport.toUpperCase()} • {item.awayTeam || "Away"} @ {item.homeTeam || "Home"}</p>
                      <p className="text-[11px] text-white/60">Current step {effectiveState(item)} • Updated {new Date(item.updatedAt).toLocaleString()}</p>
                      <p className="text-[11px] text-white/60">Retry {failedCount} • {latestFailed?.errorMessage || "No failure reason recorded."}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "pipeline" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/60">Jobs Submitted</p><p className="text-lg font-semibold text-cyan-200">{summary?.totals.submitted || 0}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/60">Videos Completed</p><p className="text-lg font-semibold text-emerald-200">{summary?.totals.completed || 0}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/60">Failed Jobs</p><p className="text-lg font-semibold text-rose-200">{summary?.totals.failed || 0}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-white/60">Today Slate</p><p className="text-lg font-semibold text-fuchsia-200">{summary?.todaySlate.withVideoJobs || 0}/{summary?.todaySlate.totalGames || 0}</p></div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-200">Engine Room</h3>
              <button type="button" onClick={() => void runPipeline()} disabled={runningPipeline} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">{runningPipeline ? "Running..." : "Run Pipeline"}</button>
            </div>
            <p className="mt-2 text-xs text-white/70">
              Pipeline {asBool(pipelineConfig?.enabled, true) ? "enabled" : "disabled"} • Shadow {asBool(pipelineConfig?.shadow_mode, false) ? "on" : "off"} •
              Completion rate {summary?.totals.all ? `${Math.round(((summary?.totals.completed || 0) / summary.totals.all) * 100)}%` : "0%"} •
              Publish success rate {summary?.social.published !== undefined ? `${Math.round((summary.social.published / Math.max(1, summary.social.published + summary.social.failed)) * 100)}%` : "0%"}
            </p>
            <p className="mt-1 text-xs text-white/60">Missing env: {(pipelineHealth?.missingEnv || []).join(", ") || "none"}</p>
          </div>
        </div>
      )}

      {activeTab === "publishing" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {[
              { label: "App", enabled: true, queued: publishingQueue.filter((i) => i.publishStatus !== "published_owned").length, posted: publishingQueue.filter((i) => i.publishStatus === "published_owned").length, failed: 0 },
              { label: "Website", enabled: true, queued: publishingQueue.filter((i) => i.publishStatus !== "published_owned").length, posted: publishingQueue.filter((i) => i.publishStatus === "published_owned").length, failed: 0 },
              { label: "Instagram", enabled: asBool(pipelineConfig?.platform_instagram_enabled, true), queued: publishingQueue.filter((i) => i.socialStatusInstagram === "queued").length, posted: publishingQueue.filter((i) => i.socialStatusInstagram === "published").length, failed: publishingQueue.filter((i) => i.socialStatusInstagram === "failed").length },
              { label: "Facebook", enabled: asBool(pipelineConfig?.platform_facebook_enabled, true), queued: publishingQueue.filter((i) => i.socialStatusFacebook === "queued").length, posted: publishingQueue.filter((i) => i.socialStatusFacebook === "published").length, failed: publishingQueue.filter((i) => i.socialStatusFacebook === "failed").length },
              { label: "TikTok", enabled: asBool(pipelineConfig?.platform_tiktok_enabled, true), queued: publishingQueue.filter((i) => i.socialStatusTiktok === "queued").length, posted: publishingQueue.filter((i) => i.socialStatusTiktok === "published").length, failed: publishingQueue.filter((i) => i.socialStatusTiktok === "failed").length },
              { label: "Snapchat", enabled: false, queued: 0, posted: 0, failed: 0 },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs uppercase text-cyan-300">{card.label}</p>
                <p className="mt-1 text-xs text-white/70">{card.enabled ? "enabled" : "manual/off"}</p>
                <p className="text-[11px] text-white/60">Queued {card.queued} • Posted {card.posted} • Failed {card.failed}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
            {publishingQueue.slice(0, 40).map((item) => (
              <div key={item.itemId} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-white/85">{item.sport.toUpperCase()} • {item.headline}</p>
                <p className="text-[11px] text-white/65">IG {item.socialStatusInstagram} • FB {item.socialStatusFacebook} • TikTok {item.socialStatusTiktok} • App/Site {item.publishStatus}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void publishNow(item.itemId)} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">Publish Now</button>
                  <button type="button" onClick={() => {
                    const v = prompt("Schedule ISO time (blank to cancel)", String(parseMeta(item.metadataJson).scheduled_for || ""));
                    void scheduleItem(item.itemId, v && v.trim().length > 0 ? v : null, String(parseMeta(item.metadataJson).scheduled_for || ""));
                  }} className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[11px] text-violet-100">Schedule</button>
                  <button type="button" onClick={() => void retrySocial(item.itemId)} className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">Retry</button>
                  <button type="button" onClick={() => void scheduleItem(item.itemId, null, String(parseMeta(item.metadataJson).scheduled_for || ""))} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "recovery" && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-semibold text-cyan-200">Failure Recovery</h2>
          <div className="mt-3 space-y-2">
            {recoveryItems.length === 0 && <p className="text-xs text-white/50">No active recovery items.</p>}
            {recoveryItems.map((item) => {
              const latestFailed = (jobsByGame.get(item.gameId) || []).find((j) => j.status === "failed" && j.errorMessage);
              return (
                <div key={item.itemId} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/85">{item.sport.toUpperCase()} • {item.headline}</p>
                  <p className="text-[11px] text-white/60">Failure reason: {latestFailed?.errorMessage || String(parseMeta(item.metadataJson).approval_note || item.videoStatus)}</p>
                  {item.videoUrl && <a href={item.videoUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[11px] text-cyan-300 underline">Preview Video</a>}
                  <details className="mt-1"><summary className="cursor-pointer text-[11px] text-cyan-200">Script Preview</summary><p className="mt-1 text-[11px] text-white/70">{item.videoScript}</p></details>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void retryVideo(item.itemId)} className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">Retry</button>
                    <button type="button" onClick={() => void retryVideo(item.itemId)} className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[11px] text-violet-100">Regenerate</button>
                    <button type="button" onClick={() => { setEditingItemId(item.itemId); setScriptDraft(item.videoScript); setActiveTab("studio"); }} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Edit Script</button>
                    <button type="button" onClick={() => void setApproval(item.itemId, "needs_review", approvalStatusValue(item))} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">Send Back to Review</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-cyan-200">Safety Controls</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void updateConfig({ enabled: asBool(pipelineConfig?.enabled, true) ? "false" : "true" })} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Pipeline {asBool(pipelineConfig?.enabled, true) ? "on" : "off"}</button>
              <button type="button" onClick={() => void updateConfig({ shadow_mode: asBool(pipelineConfig?.shadow_mode, false) ? "false" : "true" })} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Shadow {asBool(pipelineConfig?.shadow_mode, false) ? "on" : "off"}</button>
              <button type="button" onClick={() => void updateConfig({ approval_required_before_publish: asBool(pipelineConfig?.approval_required_before_publish, true) ? "false" : "true" })} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Approval required {asBool(pipelineConfig?.approval_required_before_publish, true) ? "on" : "off"}</button>
              <button type="button" onClick={() => void updateConfig({ platform_instagram_enabled: asBool(pipelineConfig?.platform_instagram_enabled, true) ? "false" : "true" })} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Instagram {asBool(pipelineConfig?.platform_instagram_enabled, true) ? "on" : "off"}</button>
              <button type="button" onClick={() => void updateConfig({ platform_facebook_enabled: asBool(pipelineConfig?.platform_facebook_enabled, true) ? "false" : "true" })} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">Facebook {asBool(pipelineConfig?.platform_facebook_enabled, true) ? "on" : "off"}</button>
              <button type="button" onClick={() => void updateConfig({ platform_tiktok_enabled: asBool(pipelineConfig?.platform_tiktok_enabled, true) ? "false" : "true" })} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80">TikTok {asBool(pipelineConfig?.platform_tiktok_enabled, true) ? "on" : "off"}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={sportsDraft} onChange={(e) => setSportsDraft(e.target.value)} className="min-w-[280px] rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white" />
              <button type="button" onClick={() => void updateConfig({ enabled_sports: sportsDraft })} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">Save Sports</button>
              <input value={dailyMaxDraft} onChange={(e) => setDailyMaxDraft(e.target.value)} className="w-28 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white" placeholder="Daily max" />
              <button type="button" onClick={() => void updateConfig({ daily_max_videos: dailyMaxDraft })} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">Save Daily Max</button>
              <input value={retryLimitDraft} onChange={(e) => setRetryLimitDraft(e.target.value)} className="w-28 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white" placeholder="Retry limit" />
              <button type="button" onClick={() => void updateConfig({ retry_limit: retryLimitDraft })} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100">Save Retry Limit</button>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-cyan-200">Operational Notes</h2>
            <p className="mt-2 text-xs text-white/70">
              Workflow: script generation to video generation to studio review to approval to publishing queue.
              Approval-first policy is visible here and can be toggled intentionally.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-cyan-200">Lane Destination Matrix</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyLaneDestinationsJson()}
                  className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100"
                >
                  Copy Matrix JSON
                </button>
                <button
                  type="button"
                  onClick={resetLaneDestinations}
                  className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80"
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/65">
              Controls where each lane is expected to publish. This updates Studio routing labels for items without explicit destination overrides.
            </p>
            <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-cyan-200">Import Matrix JSON</summary>
              <p className="mt-2 text-[11px] text-white/65">
                Paste a JSON object with keys: game_content, betting_intelligence, watchboard_live.
              </p>
              <textarea
                value={laneDestinationImportDraft}
                onChange={(e) => setLaneDestinationImportDraft(e.target.value)}
                className="mt-2 h-36 w-full rounded-md border border-white/15 bg-black/30 p-2 text-[11px] text-white outline-none"
              />
              <div className="mt-2 rounded-md border border-white/10 bg-black/30 p-2">
                <p className="text-[11px] font-semibold text-cyan-200">Expected JSON shape</p>
                <p className="mt-1 text-[11px] text-white/60">
                  Required keys: <span className="text-white/80">game_content</span>, <span className="text-white/80">betting_intelligence</span>, <span className="text-white/80">watchboard_live</span>
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-[10px] text-white/75">{`{
  "game_content": ["game_page", "homepage_featured", "social_optional"],
  "betting_intelligence": ["edges_tab", "sharp_money_tab", "line_movement_tab", "prop_watch_tab", "social_optional"],
  "watchboard_live": ["watchboard", "live_alerts_feed", "live_game_cards"]
}`}</pre>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={importLaneDestinationsJson}
                  className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[11px] text-violet-100"
                >
                  Apply Imported Matrix
                </button>
              </div>
            </details>
            <div className="mt-3 space-y-3">
              {(["game_content", "betting_intelligence", "watchboard_live"] as ContentLane[]).map((lane) => (
                <div key={lane} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold text-white">{laneLabel(lane)}</p>
                  <p className="mt-1 text-[11px] text-white/60">
                    Current: {(laneDestinationDefaults[lane] || []).map(destinationLabel).join(", ")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={laneDestinationDrafts[lane] || ""}
                      onChange={(e) => setLaneDestinationDrafts((prev) => ({ ...prev, [lane]: e.target.value }))}
                      className="min-w-[360px] flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white"
                      placeholder="Comma separated destinations"
                    />
                    <button
                      type="button"
                      onClick={() => saveLaneDestinations(lane)}
                      className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
        Average generation time derived from queue timestamps • Rolling 24h jobs {summary?.rolling24h.all || 0} • Published today {pipelineHealth?.today?.socialsPublished || 0}
      </div>

      {undoToast && (
        <div className="fixed bottom-4 right-4 z-40 w-[320px] rounded-xl border border-cyan-400/30 bg-[#071022] p-3 shadow-lg shadow-cyan-900/30">
          <p className="text-xs text-white/85">{undoToast.message}</p>
          <div className="mt-2 flex gap-2">
            {undoToast.undoAction && (
              <button
                type="button"
                onClick={() => {
                  const action = undoToast.undoAction;
                  setUndoToast(null);
                  if (action) void action();
                }}
                className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={() => setUndoToast(null)}
              className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-white/80"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-white/15 bg-[#090f1b] p-5">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-white">Video Preview</h2>
              <button type="button" onClick={() => setPreviewItem(null)} className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/80">Close</button>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/15 bg-black">
              {previewItem.videoUrl ? (
                <video src={previewItem.videoUrl} controls className="max-h-[55vh] w-full bg-black" />
              ) : (
                <div className="flex h-60 items-center justify-center text-sm text-white/70">Video still processing.</div>
              )}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-white/80">
                <p><span className="text-white/60">Lane:</span> {laneLabel(contentLane(previewItem))}</p>
                <p><span className="text-white/60">Content Type:</span> {contentTypeLabel(contentType(previewItem))}</p>
                <p><span className="text-white/60">Sport:</span> {previewItem.sport.toUpperCase()}</p>
                <p><span className="text-white/60">Game:</span> {previewItem.awayTeam || "Away"} @ {previewItem.homeTeam || "Home"}</p>
                <p><span className="text-white/60">Destinations:</span> {publishDestinations(previewItem).map((d) => d.replace(/_/g, " ")).join(", ")}</p>
                <p><span className="text-white/60">Status:</span> {effectiveState(previewItem)}</p>
                <p><span className="text-white/60">Generated:</span> {new Date(previewItem.updatedAt).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-semibold text-cyan-200">Script text</p>
                <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-white/75">{previewItem.videoScript}</p>
                <p className="mt-3 text-xs font-semibold text-cyan-200">Article preview</p>
                <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-white/75">{previewItem.fullText || previewItem.fullAnalysisText || previewItem.shortSummary}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-white/60">Modal shortcuts: A approve • E edit script • R regenerate • X reject • S send to publishing queue.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void setApproval(previewItem.itemId, "approved", approvalStatusValue(previewItem))} className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs text-emerald-100">Approve Video</button>
              <button type="button" onClick={() => { setEditingItemId(previewItem.itemId); setScriptDraft(previewItem.videoScript); setActiveTab("studio"); setPreviewItem(null); }} className="rounded-md border border-white/15 bg-black/20 px-3 py-1 text-xs text-white/80">Edit Script</button>
              <button type="button" onClick={() => void retryVideo(previewItem.itemId)} className="rounded-md border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs text-amber-100">Regenerate Video</button>
              <button type="button" onClick={() => void setApproval(previewItem.itemId, "rejected", approvalStatusValue(previewItem))} className="rounded-md border border-rose-400/30 bg-rose-500/15 px-3 py-1 text-xs text-rose-100">Reject Video</button>
              <button type="button" onClick={() => void publishNow(previewItem.itemId)} className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-100">Send to Publishing Queue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
